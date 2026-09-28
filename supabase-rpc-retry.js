// Server-only retry circuit for optional RPCs. A failed read must not permanently
// switch a warm instance to the more expensive legacy queries.
function createRpcRetryState() {
  let failures = 0;
  let retryAt = 0;
  let probing = false;
  return {
    begin() {
      if (Date.now() < retryAt || probing) return false;
      if (failures) probing = true;
      return true;
    },
    succeeded() {
      failures = 0;
      retryAt = 0;
      probing = false;
    },
    failed() {
      failures = Math.min(failures + 1, 4);
      retryAt = Date.now() + Math.min(60000 * (2 ** (failures - 1)), 300000);
      probing = false;
    },
  };
}

module.exports = { createRpcRetryState };
