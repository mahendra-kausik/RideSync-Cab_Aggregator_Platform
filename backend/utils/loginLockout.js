const redisClient = require('../config/redis');
const { withRedisTimeout } = require('./withRedisTimeout');
const { auth } = require('../config/security');
const encryptionUtils = require('./encryption');

// IP+account-scoped login lockout (P-008): keyed on the requester's IP AND the
// target account, not the account alone -- so one attacker failing 5 times
// only locks themselves out of guessing that account, and a legitimate user
// on a different IP can still log in with the correct password. Fixed-window
// counter, same INCR/PEXPIRE/PTTL shape as redisRateLimitStore.js. Falls back
// to an in-memory Map (single-process only) when REDIS_URL is unset, matching
// the rest of this app's Redis-optional story (see D-002).
const memoryStore = new Map();

function memoryGet(key) {
  const entry = memoryStore.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry;
}

function buildKey(ip, identifier) {
  // identifier is hashed (not raw email/phone) so Redis keys don't carry PII.
  const identifierHash = encryptionUtils.hashData(identifier);
  return `login_lockout:${ip}:${identifierHash}`;
}

async function recordFailedLogin(ip, identifier) {
  const key = buildKey(ip, identifier);
  const windowMs = auth.accountLockoutMinutes * 60 * 1000;

  let attempts;
  if (redisClient) {
    attempts = await withRedisTimeout(redisClient.incr(key), undefined, 'lockout:incr');
    if (attempts === 1 || attempts === auth.maxLoginAttempts) {
      // Arm the TTL on the first attempt, then re-arm it to a fresh full
      // window right when the lock actually engages, so the lockout
      // duration counts from the lockout itself, not the first failed try.
      await withRedisTimeout(redisClient.pexpire(key, windowMs), undefined, 'lockout:pexpire');
    }
  } else {
    const existing = memoryGet(key);
    attempts = (existing?.count || 0) + 1;
    const expiresAt = (!existing || attempts === auth.maxLoginAttempts)
      ? Date.now() + windowMs
      : existing.expiresAt;
    memoryStore.set(key, { count: attempts, expiresAt });
  }

  return attempts >= auth.maxLoginAttempts;
}

async function isLocked(ip, identifier) {
  const key = buildKey(ip, identifier);

  if (redisClient) {
    const attempts = await withRedisTimeout(redisClient.get(key), undefined, 'lockout:get');
    return Number(attempts) >= auth.maxLoginAttempts;
  }

  const existing = memoryGet(key);
  return !!existing && existing.count >= auth.maxLoginAttempts;
}

async function resetFailedLogins(ip, identifier) {
  const key = buildKey(ip, identifier);
  if (redisClient) {
    await withRedisTimeout(redisClient.del(key), undefined, 'lockout:del');
  } else {
    memoryStore.delete(key);
  }
}

module.exports = { recordFailedLogin, isLocked, resetFailedLogins };
