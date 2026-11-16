export const APTITUDE_MINUTES = Object.freeze({
  half: Object.freeze([8, 10, 5, 8, 15]),
  full: Object.freeze([15, 20, 10, 15, 30])
});

export function formatAptitudeTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function createAptitudeTimer({storage, storageKey, now = Date.now} = {}) {
  const duration = (kind, section) => APTITUDE_MINUTES[kind][section] * 60000;
  const fresh = (kind = 'half', section = 0) => ({version: 1, kind, section, status: 'idle', remainingMs: duration(kind, section), endAt: null});
  let state = fresh(), lastStored = null, storageFailed = false;

  function decode(raw) {
    try {
      const value = JSON.parse(raw);
      if (!value || value.version !== 1 || !Object.hasOwn(APTITUDE_MINUTES, value.kind) || !Number.isInteger(value.section) || value.section < 0 || value.section > 4) return fresh();
      const maximum = duration(value.kind, value.section);
      if (!['idle', 'running', 'paused', 'finished'].includes(value.status) || !Number.isSafeInteger(value.remainingMs) || value.remainingMs < 0 || value.remainingMs > maximum) return fresh();
      if (value.status === 'running' ? !Number.isSafeInteger(value.endAt) || value.endAt <= 0 || value.endAt > now() + maximum : value.endAt !== null) return fresh();
      if (value.status === 'idle' && value.remainingMs !== maximum || value.status === 'finished' && value.remainingMs !== 0) return fresh();
      return {version: 1, kind: value.kind, section: value.section, status: value.status, remainingMs: value.remainingMs, endAt: value.endAt};
    } catch { return fresh(); }
  }

  function refresh() {
    if (!storage || !storageKey) return;
    try {
      const raw = storage.getItem(storageKey);
      if (raw !== lastStored) { state = raw ? decode(raw) : fresh(); lastStored = raw; }
    } catch { storageFailed = true; }
  }

  function persist() {
    if (!storage || !storageKey) return;
    try {
      const raw = JSON.stringify(state);
      storage.setItem(storageKey, raw); lastStored = raw; storageFailed = false;
    } catch { storageFailed = true; }
  }

  function snapshot() {
    refresh();
    const remainingMs = state.status === 'running' ? Math.max(0, state.endAt - now()) : state.remainingMs;
    if (state.status === 'running' && remainingMs === 0) {
      state = {...state, remainingMs: 0, endAt: null, status: 'finished'}; persist();
    }
    return {...state, remainingMs, durationMs: duration(state.kind, state.section), persistent: !storageFailed};
  }

  return {
    storageKey,
    snapshot,
    start() {
      const current = snapshot();
      if (current.status === 'running') return current;
      const remainingMs = current.remainingMs || current.durationMs;
      state = {...state, status: 'running', remainingMs, endAt: now() + remainingMs}; persist(); return snapshot();
    },
    pause() {
      const current = snapshot();
      if (current.status === 'running') { state = {...state, status: 'paused', remainingMs: current.remainingMs, endAt: null}; persist(); }
      return snapshot();
    },
    reset() { snapshot(); state = fresh(state.kind, state.section); persist(); return snapshot(); },
    select(kind, section) {
      if (!Object.hasOwn(APTITUDE_MINUTES, kind) || !Number.isInteger(section) || section < 0 || section > 4) throw Error('invalid_timer_selection');
      refresh(); state = fresh(kind, section); persist(); return snapshot();
    }
  };
}
