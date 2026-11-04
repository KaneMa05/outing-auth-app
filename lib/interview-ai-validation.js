'use strict';
const crypto = require('node:crypto');
const KINDS = new Set(['self_intro', 'motivation', 'public_service', 'core30']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const fail = (code, status = 400) => { throw Object.assign(new Error(code), {status}); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function text(value, max, min = 1) {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}
function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some(k => !allowed.includes(k))) fail('invalid_request');
}
function validateResult(result, sources, kind) {
  keys(result, ['schema_version', 'status', 'answer', 'source_refs', 'experience_coverage', 'missing']);
  if (result.schema_version !== '1.0' || !['ready', 'needs_input'].includes(result.status) ||
      !text(result.answer, 8000, 0) || !Array.isArray(result.source_refs) ||
      result.source_refs.length > 80 || !Array.isArray(result.experience_coverage) ||
      result.experience_coverage.length > 40 || !Array.isArray(result.missing) ||
      result.missing.length > 10 || result.missing.some(x => !text(x, 500)) ||
      Buffer.byteLength(JSON.stringify(result)) > 65536) fail('invalid_output', 422);
  for (const ref of result.source_refs) {
    keys(ref, ['source_id', 'quote', 'answer_excerpt']);
    if (!text(ref.source_id, 160) || !text(ref.quote, 2000) || !text(ref.answer_excerpt, 2000))
      fail('invalid_output', 422);
  }
  for (const c of result.experience_coverage) {
    keys(c, ['experience_id', 'answer_excerpt']);
    if (!text(c.experience_id, 80) || !text(c.answer_excerpt, 3000)) fail('invalid_output', 422);
  }
  if (result.status === 'needs_input') {
    if (result.answer || !result.missing.length || result.source_refs.length || result.experience_coverage.length)
      fail('invalid_output', 422);
    return result;
  }
  if (!result.answer.trim() || !result.source_refs.length || result.missing.length) fail('invalid_output', 422);
  if (sources) {
    const map = new Map(sources.map(s => [s.id, s]));
    for (const ref of result.source_refs) {
      if (!map.has(ref.source_id) || !map.get(ref.source_id).text.includes(ref.quote) ||
          !result.answer.includes(ref.answer_excerpt)) fail('invalid_evidence', 422);
    }
    if (kind === 'self_intro') {
      const used = new Set(), excerpts = new Set();
      for (const coverage of result.experience_coverage) {
        if (!result.answer.includes(coverage.answer_excerpt) ||
            !result.source_refs.some(ref => map.get(ref.source_id)?.experience_id === coverage.experience_id &&
              coverage.answer_excerpt.includes(ref.answer_excerpt))) fail('experience_required', 422);
        used.add(coverage.experience_id); excerpts.add(coverage.answer_excerpt);
      }
      if (used.size < 3 || excerpts.size < 3) fail('experience_required', 422);
    }
  }
  return result;
}
module.exports = {KINDS, UUID, HASH, fail, object, text, keys, validateResult,
  hash: value => crypto.createHash('sha256').update(value).digest('hex')};
