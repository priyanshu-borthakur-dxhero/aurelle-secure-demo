const test = require("node:test");
const assert = require("node:assert");
const products = require("../productCatalog");

test("catalog has 40 products with unique ids and skus", () => {
  assert.strictEqual(products.length, 40);
  assert.strictEqual(new Set(products.map((p) => p[0])).size, 40);
  assert.strictEqual(new Set(products.map((p) => p[1])).size, 40);
});

test("every product has a name, category and positive price", () => {
  for (const [, , name, category, price] of products) {
    assert.ok(name.length > 0);
    assert.ok(category.length > 0);
    assert.ok(price > 0);
  }
});
