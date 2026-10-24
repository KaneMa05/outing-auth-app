const { createRpcRetryState } = require('../supabase-rpc-retry');

// Only a missing additive function enables the compatibility path. A timeout or
// malformed response must not fan out into more expensive queries.
function createCafeReadModels(request) {
  const circuits = new Map();
  return async function readModel(name, params, keys) {
    if (process.env.STUDY_CAFE_READ_MODELS_ENABLED === 'false') return null;
    if (!circuits.has(name)) circuits.set(name, createRpcRetryState());
    const circuit = circuits.get(name);
    if (!circuit.begin()) return null;
    try {
      const result = await request('POST', `rpc/${name}`, params);
      if (!result || !keys.every(key => Array.isArray(result[key]))) {
        const error = new Error('study_cafe_read_model_invalid_response');
        error.status = 502;
        throw error;
      }
      circuit.succeeded();
      return result;
    } catch (error) {
      let detail;
      try { detail = JSON.parse(error.detail); } catch (_) { /* Non-JSON response. */ }
      if (error.storeStatus === 404 && detail?.code === 'PGRST202') {
        circuit.failed();
        return null;
      }
      circuit.succeeded();
      throw error;
    }
  };
}

// Stable ordering is supplied by callers. Respect a server cap smaller than the
// requested page using Content-Range; a short page alone need not mean EOF.
async function readCafePages(request, path, pageSize = 500) {
  const rows = [];
  for (let offset = 0; ;) {
    const page = await request('GET', `${path}&offset=${offset}&limit=${pageSize}`);
    if (!Array.isArray(page)) throw new Error('study_cafe_rows_invalid_response');
    rows.push(...page);
    if (!page.length) return rows;
    if (Number.isFinite(page.nextPageOffset)) {
      if (page.nextPageOffset <= offset) throw new Error('study_cafe_page_did_not_advance');
      offset = page.nextPageOffset;
    } else {
      if (page.length < pageSize) return rows;
      offset += page.length;
    }
  }
}
module.exports = { createCafeReadModels, readCafePages };
