// Bounds a single request-time Redis command so a stale connection fails fast
// instead of hanging forever (P-006). Only for request-path calls — never wrap
// boot-time or Socket.IO-adapter commands (an earlier attempt at a client-level
// timeout bounded those too and caused a boot crash-loop, see DECISIONS.md P-006).
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
