const assert = require("node:assert/strict");
const { withSupabaseDeadline } = require("../supabase-request-timeout");

(async () => {
  assert.equal(await withSupabaseDeadline(async () => "ok"), "ok");
  const storeError = Object.assign(new Error("store unavailable"), { storeStatus: 522 });
  await assert.rejects(withSupabaseDeadline(async () => { throw storeError; }), error => error === storeError);
  let writes = 0;
  // Keep the event loop alive while AbortSignal.timeout (which is unref'd) fires.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(withSupabaseDeadline(async signal => {
      writes++;
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }, { timeoutMs: 10 }), { message: "supabase_request_timeout", status: 503 });
    assert.equal(writes, 1, "a timed-out write is never replayed");
    await assert.rejects(withSupabaseDeadline(async signal => {
      // Simulate response.json().catch(() => null) on an aborted response body.
      return new Promise(resolve => signal.addEventListener("abort", () => resolve(null), { once: true }));
    }, { timeoutMs: 10 }), { message: "supabase_request_timeout", status: 503 });
    const caller = new AbortController();
    const request = withSupabaseDeadline(async signal => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }), { signal: caller.signal });
    caller.abort();
    await assert.rejects(request, { status: 503 });
    let started = false;
    await assert.rejects(withSupabaseDeadline(async () => { started = true; }, { signal: caller.signal }), { status: 503 });
    assert.equal(started, false);
  } finally { clearInterval(keepAlive); }
  console.log("Supabase request deadline tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
