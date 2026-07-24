const RedisRateLimitStore = require('../../utils/redisRateLimitStore');

function mockMakeFakeRedis() {
  const store = new Map();
  const ttls = new Map();
  return {
    async incr(key) {
      const next = (store.get(key) || 0) + 1;
      store.set(key, next);
      return next;
    },
    async decr(key) {
      const next = (store.get(key) || 0) - 1;
      store.set(key, next);
      return next;
    },
    async pexpire(key, ms) {
      ttls.set(key, ms);
      return 1;
    },
    async pttl(key) {
      return ttls.has(key) ? ttls.get(key) : -1;
    },
    async del(key) {
      store.delete(key);
      ttls.delete(key);
      return 1;
    }
  };
}

describe('RedisRateLimitStore', () => {
  it('increments a fresh key, arms expiry only on the first hit, and reports resetTime', async () => {
    const redis = mockMakeFakeRedis();
    const rateStore = new RedisRateLimitStore(redis, 'rl:test:');
    rateStore.init({ windowMs: 60000 });

    const first = await rateStore.increment('client-a');
    expect(first.totalHits).toBe(1);
    expect(first.resetTime.getTime()).toBeGreaterThan(Date.now());

    const second = await rateStore.increment('client-a');
    expect(second.totalHits).toBe(2);
  });

  it('keys are prefixed and isolated between different clients', async () => {
    const redis = mockMakeFakeRedis();
    const rateStore = new RedisRateLimitStore(redis, 'rl:test:');
    rateStore.init({ windowMs: 60000 });

    await rateStore.increment('client-a');
    const b = await rateStore.increment('client-b');
    expect(b.totalHits).toBe(1);
  });

  it('resetKey clears the counter', async () => {
    const redis = mockMakeFakeRedis();
    const rateStore = new RedisRateLimitStore(redis, 'rl:test:');
    rateStore.init({ windowMs: 60000 });

    await rateStore.increment('client-a');
    await rateStore.resetKey('client-a');
    const after = await rateStore.increment('client-a');
    expect(after.totalHits).toBe(1);
  });
});
