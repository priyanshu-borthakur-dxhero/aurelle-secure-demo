const test = require("node:test");
const assert = require("node:assert");
const { isValidQuantity, cartTotal, applyDiscount, shippingFor } = require("../orderMath");

test("isValidQuantity accepts whole numbers from 1 to 99", () => {
  assert.strictEqual(isValidQuantity(1), true);
  assert.strictEqual(isValidQuantity(99), true);
  assert.strictEqual(isValidQuantity(0), false);
  assert.strictEqual(isValidQuantity(100), false);
  assert.strictEqual(isValidQuantity(1.5), false);
});

test("cartTotal adds up price times quantity", () => {
  const items = [
    { sku: "ELEC-001", price: 24.99, quantity: 2 },
    { sku: "HOME-001", price: 12.5, quantity: 1 },
  ];
  assert.strictEqual(cartTotal(items), 62.48);
});

test("cartTotal rejects bad input", () => {
  assert.throws(() => cartTotal("nope"), TypeError);
  assert.throws(() => cartTotal([{ sku: "X", price: 1, quantity: 0 }]), RangeError);
});

test("applyDiscount applies known codes only", () => {
  assert.strictEqual(applyDiscount(100, "welcome10"), 90);
  assert.strictEqual(applyDiscount(100, "SPRING15"), 85);
  assert.strictEqual(applyDiscount(100, "unknown"), 100);
  assert.strictEqual(applyDiscount(100), 100);
});

test("shippingFor is free from 100 upwards", () => {
  assert.strictEqual(shippingFor(0), 0);
  assert.strictEqual(shippingFor(40), 7.5);
  assert.strictEqual(shippingFor(100), 0);
});
