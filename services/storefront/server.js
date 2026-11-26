const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { pool, initialize } = require("./db");
const logger = require("./logger");

const app = express();
app.use(express.json());

// One log line per request, with the status, duration and route.
app.use((req, res, next) => {
  if (!req.path.startsWith("/api") && req.path !== "/") return next(); // skip static asset requests
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    logger[level](
      { method: req.method, path: req.path, status: res.statusCode, duration_ms: Math.round(durationMs * 10) / 10 },
      `${req.method} ${req.path} ${res.statusCode}`
    );
  });
  next();
});

const PORT = process.env.PORT || 8080;

// Express 4 does not catch rejected promises from async handlers.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Downstream services. When a URL is not set that step is skipped, so the storefront still runs on its own.
const INVENTORY_URL = process.env.INVENTORY_URL; // inventory-service (Python)
const PAYMENTS_URL = process.env.PAYMENTS_URL; // payments-service (Java)

async function callJson(base, path, { method = "POST", body, timeoutMs = 5000 } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, ok: res.ok, data };
}

async function releaseStock(orderRef) {
  if (!INVENTORY_URL) return;
  try {
    await callJson(INVENTORY_URL, "/release", { body: { orderRef } });
  } catch (err) {
    logger.error({ order_ref: orderRef, err: { message: err.message } }, "Could not release held stock");
  }
}

// The storefront (public/) is served at "/" to browsers; API clients that don't ask for HTML still get the JSON status.
app.use(express.static(path.join(__dirname, "public"), { index: false }));

app.get("/", (req, res) => {
  if (req.accepts(["json", "html"]) === "html") {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  res.json({
    status: "ok",
    service: "node-app",
    endpoints: [
      "GET /api/products?q=&category=&page=&pageSize=",
      "GET /api/products/{id}",
      "GET /api/search?q=",
      "POST /api/orders",
      "GET /api/orders?take=",
      "GET /api/orders/{id}",
    ],
  });
});

app.get(
  "/api/products",
  wrap(async (req, res) => {
    let { q, category, page, pageSize } = req.query;
    page = parseInt(page, 10) || 1;
    pageSize = Math.min(parseInt(pageSize, 10) || 20, 100);
    if (page <= 0) page = 1;

    const { rows } = await pool.query(
      `SELECT id AS "Id", sku AS "Sku", name AS "Name", category AS "Category", price AS "Price"
       FROM products
       WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR sku ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR category = $2)
       ORDER BY id
       LIMIT $3 OFFSET $4`,
      [q || null, category || null, pageSize, (page - 1) * pageSize]
    );

    res.json({ page, pageSize, count: rows.length, products: rows });
  })
);

// Product search: free-text lookup on name, sku or category.
app.get(
  "/api/search",
  wrap(async (req, res) => {
    const q = req.query.q || "";
    const sql =
      `SELECT id AS "Id", sku AS "Sku", name AS "Name", category AS "Category", price AS "Price" ` +
      `FROM products WHERE name ILIKE '%${q}%' OR sku ILIKE '%${q}%' OR category ILIKE '%${q}%' ORDER BY id LIMIT 50`;
    const { rows } = await pool.query(sql);
    res.json({ q, count: rows.length, products: rows });
  })
);

app.get(
  "/api/products/:id",
  wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { rows } = Number.isInteger(id)
      ? await pool.query(
          `SELECT id AS "Id", sku AS "Sku", name AS "Name", category AS "Category", price AS "Price"
           FROM products WHERE id = $1`,
          [id]
        )
      : { rows: [] };
    const product = rows[0];

    if (!product) {
      return res.status(404).json({ error: `Product ${id} not found` });
    }

    // Live stock level from inventory-service; the product page still works if that service is down.
    if (INVENTORY_URL) {
      try {
        const stock = await callJson(INVENTORY_URL, `/stock/${id}`, { method: "GET", timeoutMs: 2000 });
        if (stock.ok) product.Available = stock.data.available;
      } catch (err) {
        logger.warn({ product_id: id, err: { message: err.message } }, "Stock lookup failed");
      }
    }
    res.json(product);
  })
);

app.post(
  "/api/orders",
  wrap(async (req, res) => {
    const body = req.body || {};
    const items = body.items || [];

    if (items.length === 0) {
      return res.status(400).json({ error: "Order must contain at least one item" });
    }
    if (items.some((i) => !Number.isInteger(i.productId) || !Number.isInteger(i.quantity) || i.quantity <= 0)) {
      return res
        .status(400)
        .json({ error: "Each item needs an integer productId and a positive integer quantity" });
    }

    const productIds = [...new Set(items.map((i) => i.productId))];
    const { rows: foundProducts } = await pool.query(
      `SELECT id AS "Id", sku AS "Sku", name AS "Name", category AS "Category", price AS "Price"
       FROM products WHERE id = ANY($1::int[])`,
      [productIds]
    );

    const productsById = new Map(foundProducts.map((p) => [p.Id, p]));
    const unknownIds = productIds.filter((id) => !productsById.has(id));
    if (unknownIds.length > 0) {
      return res
        .status(400)
        .json({ error: `Unknown product id(s): ${unknownIds.join(", ")}` });
    }

    const lineItems = items.map((i) => {
      const product = productsById.get(i.productId);
      const lineTotal = Math.round(product.Price * i.quantity * 100) / 100;
      return { product, quantity: i.quantity, lineTotal };
    });

    const subtotal = round2(lineItems.reduce((s, l) => s + l.lineTotal, 0));
    const totalUnits = lineItems.reduce((s, l) => s + l.quantity, 0);
    const discount = subtotal >= 500 ? round2(subtotal * 0.1) : 0;
    const taxableAmount = subtotal - discount;
    const tax = round2(taxableAmount * 0.0825);
    const shipping = subtotal >= 250 ? 0 : round2(5.0 + 0.75 * totalUnits);
    const total = round2(taxableAmount + tax + shipping);
    const createdAtUtc = new Date().toISOString();

    const address = body.shippingAddress || {};
    const orderRef = crypto.randomUUID();

    // Step 1: hold the stock (inventory-service, Python).
    if (INVENTORY_URL) {
      let reserve;
      try {
        reserve = await callJson(INVENTORY_URL, "/reserve", {
          body: { orderRef, items: lineItems.map((l) => ({ productId: l.product.Id, quantity: l.quantity })) },
        });
      } catch (err) {
        logger.error({ order_ref: orderRef, err: { message: err.message } }, "Inventory service unreachable");
        return res.status(503).json({ error: "Stock check is unavailable right now. Please try again." });
      }
      if (reserve.status === 409) {
        logger.warn({ order_ref: orderRef, detail: reserve.data }, "Order rejected, not enough stock");
        return res.status(409).json({ error: "Some items are out of stock", detail: reserve.data });
      }
      if (!reserve.ok) {
        logger.error({ order_ref: orderRef, status: reserve.status, detail: reserve.data }, "Stock reservation failed");
        return res.status(502).json({ error: "Could not reserve stock" });
      }
    }

    // Step 2: take payment (payments-service, Java). It commits the held stock when the payment is authorised.
    let payment = null;
    if (PAYMENTS_URL) {
      try {
        payment = await callJson(PAYMENTS_URL, "/authorize", {
          body: { orderRef, amount: total, currency: "USD", customerEmail: body.customerEmail || "guest@example.test" },
          timeoutMs: 8000,
        });
      } catch (err) {
        logger.error({ order_ref: orderRef, err: { message: err.message } }, "Payment service unreachable");
        await releaseStock(orderRef);
        return res.status(503).json({ error: "Payments are unavailable right now. Please try again." });
      }
      if (payment.status === 402) {
        await releaseStock(orderRef);
        logger.warn({ order_ref: orderRef, reason: payment.data && payment.data.reason }, "Payment declined");
        return res.status(402).json({ error: "Payment declined", reason: payment.data && payment.data.reason });
      }
      if (!payment.ok) {
        await releaseStock(orderRef);
        logger.error({ order_ref: orderRef, status: payment.status, detail: payment.data }, "Payment failed");
        return res.status(502).json({ error: "Payment could not be completed" });
      }
    }

    // Step 3: save the order.
    const client = await pool.connect();
    let orderId;
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO orders (customername, customeremail, shippingstreet, shippingcity, shippingstate, shippingzip, shippingcountry, notes, subtotal, discount, tax, shipping, total, createdatutc, orderref)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          body.customerName || "",
          body.customerEmail || "",
          address.street || "",
          address.city || "",
          address.state || "",
          address.zip || "",
          address.country || "",
          body.notes || null,
          subtotal,
          discount,
          tax,
          shipping,
          total,
          createdAtUtc,
          orderRef,
        ]
      );
      orderId = inserted.rows[0].id;

      for (const line of lineItems) {
        await client.query(
          `INSERT INTO orderitems (orderid, productid, productname, quantity, unitprice, linetotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, line.product.Id, line.product.Name, line.quantity, line.product.Price, line.lineTotal]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      if (payment) logger.error({ order_ref: orderRef }, "Order could not be saved after payment was authorised");
      throw err;
    } finally {
      client.release();
    }

    logger.info(
      { order_id: orderId, order_ref: orderRef, item_count: lineItems.length, total_units: totalUnits, total, country: address.country || null },
      `Order ${orderId} created`
    );

    res.json({
      orderId,
      orderRef,
      paymentStatus: payment ? payment.data.status : "not-required",
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      itemCount: lineItems.length,
      totalUnits,
      subtotal,
      discount,
      tax,
      shipping,
      total,
      createdAtUtc,
      items: lineItems.map((l) => ({
        id: l.product.Id,
        name: l.product.Name,
        quantity: l.quantity,
        price: l.product.Price,
        lineTotal: l.lineTotal,
      })),
    });
  })
);

app.get(
  "/api/orders",
  wrap(async (req, res) => {
    let take = parseInt(req.query.take, 10) || 20;
    take = Math.min(take <= 0 ? 20 : take, 200);

    const { rows: orders } = await pool.query(
      `SELECT id AS "Id", customername AS "CustomerName", customeremail AS "CustomerEmail", total AS "Total", createdatutc AS "CreatedAtUtc"
       FROM orders ORDER BY id DESC LIMIT $1`,
      [take]
    );

    res.json({ count: orders.length, orders });
  })
);

app.get(
  "/api/orders/:id",
  wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { rows: orderRows } = Number.isInteger(id)
      ? await pool.query(
          `SELECT id AS "Id", customername AS "CustomerName", customeremail AS "CustomerEmail", shippingstreet AS "ShippingStreet", shippingcity AS "ShippingCity", shippingstate AS "ShippingState", shippingzip AS "ShippingZip", shippingcountry AS "ShippingCountry", notes AS "Notes", subtotal AS "Subtotal", discount AS "Discount", tax AS "Tax", shipping AS "Shipping", total AS "Total", createdatutc AS "CreatedAtUtc"
           FROM orders WHERE id = $1`,
          [id]
        )
      : { rows: [] };
    const order = orderRows[0];

    if (!order) {
      return res.status(404).json({ error: `Order ${id} not found` });
    }

    const { rows: items } = await pool.query(
      `SELECT productid AS "ProductId", productname AS "ProductName", quantity AS "Quantity", unitprice AS "UnitPrice", linetotal AS "LineTotal"
       FROM orderitems WHERE orderid = $1 ORDER BY id`,
      [id]
    );

    res.json({
      order: {
        id: order.Id,
        customerName: order.CustomerName,
        customerEmail: order.CustomerEmail,
        shippingAddress: {
          street: order.ShippingStreet,
          city: order.ShippingCity,
          state: order.ShippingState,
          zip: order.ShippingZip,
          country: order.ShippingCountry,
        },
        notes: order.Notes,
        subtotal: order.Subtotal,
        discount: order.Discount,
        tax: order.Tax,
        shipping: order.Shipping,
        total: order.Total,
        createdAtUtc: order.CreatedAtUtc,
      },
      items,
    });
  })
);

function round2(n) {
  return Math.round(n * 100) / 100;
}

app.use((err, req, res, next) => {
  logger.error({ err: { message: err.message, stack: err.stack }, method: req.method, path: req.path }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

initialize()
  .then(() => {
    app.listen(PORT, () => {
      logger.info({ port: Number(PORT) }, `storefront listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    logger.fatal({ err: { message: err.message } }, "Database initialisation failed");
    logger.flush();
    setTimeout(() => process.exit(1), 200);
  });
