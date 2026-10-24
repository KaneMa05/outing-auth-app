// Framework-neutral integration for the four buttons. No automatic note overwrite.
export function createInterviewAI({request, onUpdate = () => {}, interval = 5000,
  visibility = globalThis.document, random = Math.random,
  clock = {setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: id => globalThis.clearTimeout(id)}}) {
  const inflight = new Map();
  // Keys belong to this authenticated screen, never to the next student.
  const pendingKeys = new Map();
  let stopped = false, destroyed = false, timer, currentRequest, pollVersion = 0;
  let lastData, serverVersion, signature, unchangedCount = 0, hadError = false;
  const hidden = () => visibility?.visibilityState === 'hidden';
  const clearTimer = () => clock.clearTimeout(timer);
  function reset() {lastData = undefined; serverVersion = undefined; signature = undefined; unchangedCount = 0; hadError = false;}
  function schedule(data, error = false) {
    if (stopped || destroyed || hidden()) return;
    let delay;
    if (error) delay = Math.min(60000, Math.max(interval, 15000) * 2 ** Math.min(unchangedCount++, 2));
    else {
      const items = data?.items || [];
      if (!items.some(x => ['QUEUED','PROCESSING','BLOCKED'].includes(x.status))) return;
      delay = items.some(x => x.status === 'PROCESSING') ? interval :
        items.some(x => x.status === 'BLOCKED') ? 60000 :
        Math.min(30000, interval * 2 ** Math.min(unchangedCount, 3));
    }
    // Spread clients across time rather than making all 50 poll on the same tick.
    timer = clock.setTimeout(poll, Math.round(delay * (.9 + random() * .2)));
  }
  const call = async (action, body = {}) => {
    if (destroyed) throw Object.assign(new Error('client_destroyed'), {code: 'client_destroyed'});
    const result = await request('/api/interview-ai', {action, ...body});
    if (destroyed) throw Object.assign(new Error('client_destroyed'), {code: 'client_destroyed'});
    return result;
  };
  async function poll() {
    if (stopped || destroyed || hidden() || !currentRequest) return;
    const readingRequest = currentRequest, version = pollVersion;
    try {
      const data = await call('status', {requestId: readingRequest, ...(serverVersion ? {version: serverVersion} : {})});
      if (stopped || version !== pollVersion || readingRequest !== currentRequest) return;
      if (data.unchanged && lastData) {
        unchangedCount++;
        if (hadError) onUpdate(lastData);
      }
      else {
        const next = JSON.stringify([data.stale, data.items.map(x => [x.id, x.status, x.reason, x.stale])]);
        unchangedCount = next === signature ? unchangedCount + 1 : 0;
        signature = next; lastData = data;
        onUpdate(data);
      }
      serverVersion = data.version;
      hadError = false;
      schedule(lastData);
    } catch (error) {
      if (stopped || version !== pollVersion || readingRequest !== currentRequest) return;
      hadError = true;
      onUpdate({ok: false, error: error.code || 'connection_error'});
      if (!stopped && !['unauthorized','forbidden','not_enrolled','not_found'].includes(error.code))
        schedule(lastData, true);
    }
  }
  function onVisibility() {
    clearTimer(); ++pollVersion;
    if (!hidden() && !stopped && !destroyed && currentRequest) void poll();
  }
  visibility?.addEventListener?.('visibilitychange', onVisibility);
  return {
    prepare: kind => call('prepare', {kind}),
    pause() {stopped = true; ++pollVersion; clearTimer();},
    async generate(kind, {savePending = async () => {}, regenerate = false, questionId} = {}) {
      const operationKey=kind+':'+(questionId||'');
      if (inflight.has(operationKey)) return inflight.get(operationKey);
      const operation = (async () => {
        await savePending(); // Existing app save must finish before DB-only preparation.
        const prep = await call('prepare', {kind});
        if (!prep.ready || !prep.enabled) {onUpdate(prep); return prep;}
        const keyName = `ip-ai-pending:${kind}:${questionId||''}:${prep.sourceHash}:${regenerate ? 'regenerate' : 'generate'}`;
        // Reuse a transport request key on network retries; no raw student content is stored.
        let requestKey = pendingKeys.get(keyName);
        if (!requestKey) {
          requestKey = crypto.randomUUID(); pendingKeys.set(keyName, requestKey);
        }
        const result = await call('generate', {kind, ...(kind==='core30'?{questionId}:{}), sourceHash: prep.sourceHash, requestKey, regenerate});
        if (result.requestId) {
          pendingKeys.delete(keyName);
          currentRequest = result.requestId; stopped = false; ++pollVersion; clearTimer(); reset(); await poll();
        } else onUpdate(result);
        return result;
      })().finally(() => inflight.delete(operationKey));
      inflight.set(operationKey, operation); return operation;
    },
    async resume(requestId) {
      currentRequest = requestId; stopped = false; ++pollVersion; clearTimer(); reset(); return poll();
    },
    async retryItems(requestId, kind, itemKeys, {savePending = async () => {}} = {}) {
      const dedup = `retry:${requestId}`;
      if (inflight.has(dedup)) return inflight.get(dedup);
      const operation = (async () => {
        await savePending();
        const prep = await call('prepare', {kind});
        if (!prep.ready || !prep.enabled) {onUpdate(prep); return prep;}
        const ordered = [...new Set(itemKeys)].sort();
        const keyName = `ip-ai-retry:${requestId}:${prep.sourceHash}:${ordered.join(',')}`;
        let requestKey = pendingKeys.get(keyName);
        if (!requestKey) {requestKey = crypto.randomUUID(); pendingKeys.set(keyName, requestKey);}
        const result = await call('retry_items', {requestId, itemKeys: ordered, sourceHash: prep.sourceHash, requestKey});
        if (!result.requestId) {onUpdate(result); return result;}
        pendingKeys.delete(keyName);
        currentRequest = requestId; stopped = false; ++pollVersion; clearTimer(); reset(); await poll();
        return result;
      })().finally(() => inflight.delete(dedup));
      inflight.set(dedup, operation); return operation;
    },
    requests: () => call('requests'),
    destroy() {destroyed = true; stopped = true; ++pollVersion; clearTimer(); currentRequest = null; pendingKeys.clear();
      visibility?.removeEventListener?.('visibilitychange', onVisibility); reset();}
  };
}
