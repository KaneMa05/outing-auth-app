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

function isStoreConnectionFailure(error) {
  if (["TimeoutError", "AbortError"].includes(error?.name)
    || error?.message === "fetch failed" || error?.message === "supabase_request_timeout") return true;
  if (Number(error?.storeStatus || error?.status) >= 502) return true;
  let detail;
  try { detail = JSON.parse(error?.detail); } catch (_) { /* Non-JSON gateway response. */ }
  return ["PGRST003", "57014", "53300", "57P03"].includes(detail?.code);
}

module.exports = { createRpcRetryState, isStoreConnectionFailure };
