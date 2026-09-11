const BOT_ACTIONS = new Set(['bot_list', 'bot_detail', 'bot_save', 'bot_toggle', 'bot_purchase', 'bot_equip', 'bot_unequip']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (v, max, empty = false) => typeof v === 'string' && v.trim().length <= max && (empty || v.trim().length > 0);
function validateBotRequest(body) {
  const action = body.action;
  if (!BOT_ACTIONS.has(action)) return false;
  if (action === 'bot_list') return true;
  if (!text(body.studentId, 64)) return false;
  if (action === 'bot_detail') return true;
  if (!UUID.test(body.requestId || '')) return false;
  const p = body.payload;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  if (['bot_save', 'bot_toggle'].includes(action)) {
    if (!Number.isSafeInteger(p.version) || p.version < 0) return false;
    if (action === 'bot_toggle') return typeof p.enabled === 'boolean';
    if (!text(p.name, 40) || !text(p.nickname, 10, true) || (p.nickname.trim() && !/^[가-힣A-Za-z0-9 ]{2,10}$/.test(p.nickname.trim())) || !text(p.track, 100)
      || !['navy','blue','mint','purple','orange','rose'].includes(p.avatarTone)
      || !Number.isInteger(p.preferredSeat) || p.preferredSeat < 1 || p.preferredSeat > 48
      || !Array.isArray(p.subjects) || p.subjects.length < 1 || p.subjects.length > 8
      || !p.subjects.every(s => text(s, 20)) || new Set(p.subjects.map(s => s.trim())).size !== p.subjects.length
      || !Array.isArray(p.windows) || p.windows.length !== 3
      || !p.windows.every(w => Array.isArray(w) && w.length === 2)) return false;
    const times = p.windows.flat();
    return times.every((t, i) => Number.isInteger(t) && t >= 0 && t <= 1439 && (i === 0 || t > times[i-1]));
  }
  if (!text(p.itemId, 80) || !/^[a-z0-9_]+$/.test(p.itemId)) return false;
  return action !== 'bot_purchase' || (Number.isInteger(p.expectedPrice) && p.expectedPrice >= 1 && typeof p.equip === 'boolean');
}

async function handleBotRequest({ body, session, request, broadcast }) {
  if (session?.role !== 'admin') return { status: 403, payload: { ok: false, error: 'forbidden' } };
  if (!validateBotRequest(body)) return { status: 400, payload: { ok: false, error: 'invalid_request' } };
  try {
    const result = await request('POST', 'rpc/study_cafe_bot_admin', {
      p_action: body.action.slice(4), p_student_id: body.studentId || null,
      p_payload: body.payload || {}, p_actor: session.username || session.id || 'admin',
      p_request_id: body.requestId || null,
    });
    if (!result || typeof result.ok !== 'boolean') throw new Error('bots_unavailable');
    if (result.ok && !['bot_list','bot_detail'].includes(body.action)) await broadcast('profile');
    return { status: result.ok ? 200 : result.error === 'bot_not_found' ? 404 : 409, payload: result };
  } catch (_) {
    return { status: 503, payload: { ok: false, error: 'bots_unavailable' } };
  }
}
module.exports = { BOT_ACTIONS, validateBotRequest, handleBotRequest };
