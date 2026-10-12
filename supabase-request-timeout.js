// Bound an entire store request, including reading its response body. Never
// retry here: an interrupted write may already have committed in Postgres.
async function withSupabaseDeadline(operation, { signal: callerSignal, timeoutMs = 15000 } = {}) {
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
  try {
    signal.throwIfAborted();
    const result = await operation(signal);
    // Some older callers tolerate invalid JSON. An aborted response body must
    // still be an error rather than a successful empty result.
    signal.throwIfAborted();
    return result;
  } catch (error) {
    if (signal.aborted) {
      throw Object.assign(new Error("supabase_request_timeout"), { status: 503 });
    }
    throw error;
  }
}

module.exports = { withSupabaseDeadline };
