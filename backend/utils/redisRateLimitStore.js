const { withRedisTimeout } = require('./withRedisTimeout');

// express-rate-limit v6 Store backed directly by INCR/PEXPIRE/PTTL (a fixed
// window counter), not rate-limit-redis's Lua-script RedisStore. RedisStore's
// SCRIPT LOAD/EVALSHA path retries unconditionally (and unbounded) on any
// error -- including a deliberate withRedisTimeout rejection -- so a stale
// connection just re-triggers another unbounded SCRIPT LOAD instead of
// actually failing fast (see DECISIONS.md's third/fourth P-006 entries).
// Plain INCR has no such retry machinery to fight: every command here is a
// single, independently timeout-bound call.
class RedisRateLimitStore {
  constructor(redisClient, prefix) {
    this.redis = redisClient;
    this.prefix = prefix;
    this.windowMs = 0;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  prefixKey(key) {
    return `${this.prefix}${key}`;
  }

  async increment(key) {
    const redisKey = this.prefixKey(key);
    const totalHits = await withRedisTimeout(this.redis.incr(redisKey), undefined, 'ratelimit:incr');
    if (totalHits === 1) {
      // Only arm the expiry on the first hit in a window -- matches
      // rate-limit-redis's default (resetExpiryOnChange: false) behavior.
      await withRedisTimeout(this.redis.pexpire(redisKey, this.windowMs), undefined, 'ratelimit:pexpire');
    }
    const ttl = await withRedisTimeout(this.redis.pttl(redisKey), undefined, 'ratelimit:pttl');
    return {
      totalHits,
      resetTime: new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs))
    };
  }

  async decrement(key) {
    await withRedisTimeout(this.redis.decr(this.prefixKey(key)), undefined, 'ratelimit:decr');
  }

  async resetKey(key) {
    await withRedisTimeout(this.redis.del(this.prefixKey(key)), undefined, 'ratelimit:del');
  }
}

module.exports = RedisRateLimitStore;
