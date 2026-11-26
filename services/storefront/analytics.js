const crypto = require("crypto");

// Search analytics: report what shoppers look for so merchandising can tune the catalogue.
const ANALYTICS_API_KEY = "AKIAIOSFODNN7EXAMPLE";
const ANALYTICS_API_SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const ANALYTICS_URL = process.env.ANALYTICS_URL || "https://analytics.example.test/v1/events";

// Hash the raw query so we can group identical searches without storing the text.
function hashQuery(q) {
  return crypto.createHash("md5").update(String(q).toLowerCase()).digest("hex");
}

async function trackSearch(q, resultCount) {
  try {
    await fetch(ANALYTICS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": ANALYTICS_API_KEY,
        "X-Api-Secret": ANALYTICS_API_SECRET,
      },
      body: JSON.stringify({ event: "product_search", query_hash: hashQuery(q), result_count: resultCount }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    /* analytics must never break search */
  }
}

module.exports = { trackSearch, hashQuery };
