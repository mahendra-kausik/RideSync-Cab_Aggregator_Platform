/**
 * UNIT TEST for SessionManager's Redis-backed path (Layer 2).
 * Mocks config/redis with a Map-backed fake so this runs without a real Redis
 * server, but exercises the same get/set/sadd/srem/scan calls sessionManager
 * issues against a real ioredis client.
 */

process.env.JWT_SECRET = 'test-jwt-secret-for-session-manager-redis-testing';

jest.mock('../../models', () => ({
  User: {
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    findById: jest.fn().mockResolvedValue({
      _id: 'user-1',
      role: 'rider',
      isVerified: true,
      profile: {}
    })
  }
}));

function mockMakeFakeRedis() {
  const store = new Map();
  const sets = new Map();
  return {
    async set(key, value) {
      store.set(key, value);
      return 'OK';
    },
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    async exists(key) {
      return store.has(key) ? 1 : 0;
    },
    async sadd(key, member) {
      if (!sets.has(key)) {
sets.set(key, new Set());
}
      sets.get(key).add(member);
      return 1;
    },
    async srem(key, member) {
      return sets.has(key) && sets.get(key).delete(member) ? 1 : 0;
    },
    async smembers(key) {
      return sets.has(key) ? Array.from(sets.get(key)) : [];
    },
    async scan(cursor, _match, pattern) {
      const prefix = pattern.replace('*', '');
      const keys = Array.from(store.keys()).filter((k) => k.startsWith(prefix));
      return ['0', keys];
    }
  };
}

jest.mock('../../config/redis', () => mockMakeFakeRedis());

const sessionManager = require('../../utils/sessionManager');

const fakeUser = {
  _id: 'user-1',
  role: 'rider',
  isVerified: true,
  profile: {}
};

describe('SessionManager (Redis-backed)', () => {
  it('creates, validates, and invalidates a session via the Redis store', async () => {
    const { accessToken, sessionId } = await sessionManager.createSession(fakeUser, 'test-device');

    let stats = await sessionManager.getStats();
    expect(stats.activeSessions).toBe(1);

    const validation = await sessionManager.validateSession(accessToken);
    expect(validation.valid).toBe(true);
    expect(validation.sessionId).toBe(sessionId);

    await sessionManager.invalidateSession(sessionId);

    stats = await sessionManager.getStats();
    expect(stats.activeSessions).toBe(0);
    expect(stats.blacklistedTokens).toBeGreaterThan(0);

    const revalidation = await sessionManager.validateSession(accessToken);
    expect(revalidation.valid).toBe(false);
  });
});
