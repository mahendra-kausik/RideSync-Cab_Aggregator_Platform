/**
 * UNIT TEST for SessionManager's in-memory blacklist fallback (no REDIS_URL).
 * Regression for the wholesale Map.clear() leak: once revoked-token entries
 * passed 10k, cleanup() used to un-revoke every still-valid blacklisted token.
 * The fix prunes only entries past their own TTL.
 */

process.env.JWT_SECRET = 'test-jwt-secret-for-session-manager-blacklist-testing';
delete process.env.REDIS_URL;

jest.mock('../../config/redis', () => null);

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

const sessionManager = require('../../utils/sessionManager');

const fakeUser = {
  _id: 'user-1',
  role: 'rider',
  isVerified: true,
  profile: {}
};

describe('SessionManager (in-memory blacklist fallback)', () => {
  it('keeps a blacklisted token revoked after cleanup(), unlike the old wholesale-clear behavior', async () => {
    const { accessToken, sessionId } = await sessionManager.createSession(fakeUser, 'test-device');
    await sessionManager.invalidateSession(sessionId);

    // cleanup() used to wholesale-clear the blacklist Set past a size
    // threshold. It should now only prune expired entries — this one has a
    // 7-day TTL, so it must survive.
    sessionManager.cleanup();

    const revalidation = await sessionManager.validateSession(accessToken);
    expect(revalidation.valid).toBe(false);
    expect(revalidation.error).toMatch(/invalidated/i);
  });

  it('prunes only entries past their own TTL, not the whole map', async () => {
    sessionManager.blacklistedTokens.clear();
    sessionManager.blacklistedTokens.set('expired-hash', Date.now() - 1000);
    sessionManager.blacklistedTokens.set('live-hash', Date.now() + 60 * 60 * 1000);

    sessionManager.cleanup();

    expect(sessionManager.blacklistedTokens.has('expired-hash')).toBe(false);
    expect(sessionManager.blacklistedTokens.has('live-hash')).toBe(true);
  });
});
