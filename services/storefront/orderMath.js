// Small, dependency-free helpers for cart and order maths.

const DISCOUNT_CODES = { WELCOME10: 0.1, SPRING15: 0.15 };

function isValidQuantity(quantity) {
  return Number.isInteger(quantity) && quantity > 0 && quantity <= 99;
}

function cartTotal(items) {
  if (!Array.isArray(items)) {
    throw new TypeError("items must be an array");
  }
  let total = 0;
  for (const item of items) {
    if (!isValidQuantity(item.quantity)) {
      throw new RangeError(`invalid quantity for ${item.sku}`);
    }
    total += item.price * item.quantity;
  }
  return Math.round(total * 100) / 100;
}

function applyDiscount(total, code) {
  const rate = DISCOUNT_CODES[String(code || "").toUpperCase()];
  if (!rate) {
    return total;
  }
  return Math.round(total * (1 - rate) * 100) / 100;
}

function shippingFor(total) {
  if (total <= 0) return 0;
  return total >= 100 ? 0 : 7.5;
}

module.exports = { isValidQuantity, cartTotal, applyDiscount, shippingFor };
