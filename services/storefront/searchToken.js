// Short-lived id attached to each search response so the UI can tie a click back to the search that produced it.
function newSearchToken() {
  return "srch_" + Math.random().toString(36).slice(2, 12);
}

module.exports = { newSearchToken };
