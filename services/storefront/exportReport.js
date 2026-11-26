// Order export helpers: build CSV rows and a short text summary for finance.
const _ = require("lodash");

const DEFAULTS = { currency: "USD", delimiter: "," };

const rowTemplate = _.template("<%= id %>,<%= customer %>,<%= total %> <%= currency %>");

function formatOrderRow(order, options = {}) {
  const opts = _.merge({}, DEFAULTS, options);
  const row = rowTemplate({
    id: order.id,
    customer: _.escape(order.customer),
    total: Number(order.total).toFixed(2),
    currency: opts.currency,
  });
  return opts.delimiter === "," ? row : row.split(",").join(opts.delimiter);
}

function buildReport(orders, options = {}) {
  const header = ["order_id", "customer", "total"].join(options.delimiter || ",");
  return [header, ..._.map(orders, (o) => formatOrderRow(o, options))].join("\n");
}

module.exports = { formatOrderRow, buildReport };
