const loginLockout = require('../../utils/loginLockout');

// REDIS_URL is unset in the test env, so these exercise the in-memory fallback.
describe('loginLockout', () => {
  it('is not locked before maxLoginAttempts is reached', async () => {
    const ip = '10.0.0.1';
    const identifier = 'user-a@example.com';

    for (let i = 0; i < 4; i += 1) {
      await loginLockout.recordFailedLogin(ip, identifier);
    }

    expect(await loginLockout.isLocked(ip, identifier)).toBe(false);
  });

  it('locks after the 5th failed attempt from the same ip+identifier', async () => {
    const ip = '10.0.0.2';
    const identifier = 'user-b@example.com';

    let locked = false;
    for (let i = 0; i < 5; i += 1) {
      locked = await loginLockout.recordFailedLogin(ip, identifier);
    }

    expect(locked).toBe(true);
    expect(await loginLockout.isLocked(ip, identifier)).toBe(true);
  });

  it('does not lock a different ip attempting the same account', async () => {
    const identifier = 'user-c@example.com';
    for (let i = 0; i < 5; i += 1) {
      await loginLockout.recordFailedLogin('10.0.0.3', identifier);
    }

    expect(await loginLockout.isLocked('10.0.0.3', identifier)).toBe(true);
    expect(await loginLockout.isLocked('10.0.0.4', identifier)).toBe(false);
  });

  it('resetFailedLogins clears the lock', async () => {
    const ip = '10.0.0.5';
    const identifier = 'user-d@example.com';

    for (let i = 0; i < 5; i += 1) {
      await loginLockout.recordFailedLogin(ip, identifier);
    }
    expect(await loginLockout.isLocked(ip, identifier)).toBe(true);

    await loginLockout.resetFailedLogins(ip, identifier);
    expect(await loginLockout.isLocked(ip, identifier)).toBe(false);
  });
});
