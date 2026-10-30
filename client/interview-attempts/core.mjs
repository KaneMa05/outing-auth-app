// Shared, opt-in foundation. No UI or network side effects.
export function createAttempts({store, uuid = () => crypto.randomUUID(), now = () => Date.now()}) {
  const locks = new Map();
  function serial(id, task) {
    const next = (locks.get(id) || Promise.resolve()).catch(() => {}).then(task);
    locks.set(id, next);
    return next.finally(() => { if (locks.get(id) === next) locks.delete(id); });
  }
  function owner(value) { if (typeof value !== 'string' || !value.trim()) throw Error('invalid_owner'); }
  async function read(accountId, id) {
    owner(accountId);
    const record = await store.get(id);
    if (!record || record.accountId !== accountId) throw Error('attempt_not_found');
    return record;
  }
  return {
    async start({accountId, mode, questions}) {
      owner(accountId);
      if (!['job', 'personality', 'ai'].includes(mode) || !Array.isArray(questions) || !questions.length || questions.length > 30 || questions.some(q => !q || typeof q.id !== 'string' || !q.id || typeof q.prompt !== 'string' || !q.prompt.trim()) || new Set(questions.map(q => q.id)).size !== questions.length) throw Error('invalid_attempt');
      const record = {id: uuid(), accountId, mode, questions: structuredClone(questions), state: 'recording', createdAt: now(), updatedAt: now(), chunks: 0, bytes: 0, mimeType: null, grade: null, score: null};
      await store.create(record);
      return structuredClone(record);
    },
    get: read,
    async list(accountId) { owner(accountId); return store.list(accountId); },
    append(accountId, id, blob) {
      return serial(id, async () => {
        const record = await read(accountId, id);
        if (record.state !== 'recording') throw Error('attempt_closed');
        if (!(blob instanceof Blob) || !blob.size || !blob.type.startsWith('audio/')) throw Error('invalid_audio');
        if (record.mimeType && record.mimeType !== blob.type) throw Error('audio_format_changed');
        if (record.bytes + blob.size > 64 * 1024 * 1024) throw Error('recording_limit');
        const next = {...record, chunks: record.chunks + 1, bytes: record.bytes + blob.size, mimeType: blob.type, updatedAt: now()};
        await store.append(next, blob, record.chunks);
        return next;
      });
    },
    finish(accountId, id, {interrupted = false} = {}) {
      return serial(id, async () => {
        const record = await read(accountId, id);
        if (record.state !== 'recording') return record;
        const next = {...record, state: interrupted ? 'interrupted' : 'recorded', updatedAt: now(), endedAt: now()};
        await store.update(next); return next;
      });
    },
    async audio(accountId, id) {
      const record = await read(accountId, id);
      return new Blob(await store.chunks(id), {type: record.mimeType || 'application/octet-stream'});
    },
    remove(accountId, id) { return serial(id, async () => { await read(accountId, id); await store.remove(id); }); }
  };
}
