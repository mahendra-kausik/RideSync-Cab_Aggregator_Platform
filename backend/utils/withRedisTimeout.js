// Bounds a single request-time Redis command so a stale connection fails fast
// instead of hanging forever (P-006). Only for request-path calls that are
// always awaited inside a call chain with an eventual catch -- never a
// promise a library fires eagerly/unawaited at boot (see DECISIONS.md's
// second P-006 entry: rate-limit-redis's RedisStore constructor does exactly
// that with SCRIPT LOAD, and timing that out crash-looped the app).
const REDIS_CMD_TIMEOUT_MS = 3000;

function withRedisTimeout(promise, ms = REDIS_CMD_TIMEOUT_MS, label = 'redis') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis command timed out after ${ms}ms (${label})`)), ms);
    if (timer.unref) {
      timer.unref(); // don't keep the event loop (or a Jest worker) alive for this timer
    }
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { withRedisTimeout, REDIS_CMD_TIMEOUT_MS };
