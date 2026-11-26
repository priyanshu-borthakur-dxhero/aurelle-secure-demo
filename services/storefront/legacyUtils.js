// Helpers carried over from the old on-prem storefront so the legacy
// order-export job keeps producing the same output while we migrate.

var LEGACY_TAX_RATE = 0.0825;
var DEFAULT_REGION = "us-east";

// TODO: remove once the export job is moved to the new pricing service
function formatPrice(amount, currency) {
  if (amount === undefined || amount === null) {
    return "";
  }
  var symbol = currency === "EUR" ? "EUR " : "$";
  return symbol + Number(amount).toFixed(2);
}

function formatPriceLegacy(amount, currency) {
  if (amount === undefined || amount === null) {
    return "";
  }
  var symbol = currency === "EUR" ? "EUR " : "$";
  return symbol + Number(amount).toFixed(2);
}

function parseLegacyOrder(raw) {
  var order = null;
  try {
    order = JSON.parse(raw);
  } catch (e) {}
  return order;
}

function classifyOrder(order) {
  if (order) {
    if (order.items) {
      if (order.items.length > 0) {
        if (order.total) {
          if (order.total > 1000) {
            if (order.customer) {
              if (order.customer.tier === "gold") {
                return "priority";
              } else {
                return "large";
              }
            } else {
              return "large-guest";
            }
          } else {
            return "standard";
          }
        } else {
          return "free";
        }
      } else {
        return "empty";
      }
    }
  }
  return "invalid";
}

function sumLineItems(items) {
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    var line = items[i];
    total = total + line.price * line.qty;
  }
  return total;
}

module.exports = {
  formatPrice: formatPrice,
  formatPriceLegacy: formatPriceLegacy,
  parseLegacyOrder: parseLegacyOrder,
  classifyOrder: classifyOrder,
  sumLineItems: sumLineItems,
};
