const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');
const redis = require('../config/redis');
const { withRedisTimeout } = require('./withRedisTimeout');
const { auth: authConfig, session: sessionConfig } = require('../config/security');

/**
 * Secure Session Management Utility
 * Implements token rotation, session invalidation, and security monitoring.
 * Backed by Redis when REDIS_URL is set (so sessions survive restarts and are
 * shared across instances); falls back to an in-memory Map/Set otherwise.
 */

const SESSION_PREFIX = 'sess:';
const USER_SESSIONS_PREFIX = 'sess:user:';
const BLACKLIST_PREFIX = 'bl:';
const BLACKLIST_TTL_SECONDS = sessionConfig.blacklistTtlSeconds;

class SessionManager {
  constructor() {
    this.redis = redis;
    this.activeSessions = new Map(); // in-memory fallback session store
    this.blacklistedTokens = new Map(); // in-memory fallback blacklist: hash -> expiresAtMs
    this.maxSessionsPerUser = sessionConfig.maxSessionsPerUser;
    this.sessionTimeout = sessionConfig.sessionTimeoutHours * 60 * 60 * 1000;
  }

  /**
   * Create a new secure session
   * @param {Object} user - User object
   * @param {string} deviceInfo - Device/browser information
   * @returns {Object} - Session tokens and metadata
   */
  async createSession(user, deviceInfo = 'unknown') {
    const sessionId = this.generateSessionId();
    const tokenPayload = {
      userId: user._id,
      sessionId,
      role: user.role,
      isVerified: user.isVerified,
      deviceInfo: this.hashDeviceInfo(deviceInfo)
    };

    const accessToken = this.generateAccessToken(tokenPayload);
    const refreshToken = this.generateRefreshToken(tokenPayload);

    const sessionData = {
      userId: user._id.toString(),
      sessionId,
      deviceInfo,
      createdAt: new Date(),
      lastActivity: new Date(),
      accessToken: this.hashToken(accessToken),
      refreshToken: this.hashToken(refreshToken),
      isActive: true
    };

    await this._putSession(sessionId, sessionData);

    // Cleanup old sessions for this user
    await this.cleanupUserSessions(user._id);

    // Update user's last login
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    return {
      accessToken,
      refreshToken,
      sessionId,
      expiresIn: authConfig.accessTokenExpiresIn,
      user: {
        id: user._id,
        role: user.role,
        isVerified: user.isVerified,
        profile: user.profile
      }
    };
  }

  /**
   * Validate an access token against the blacklist and session store.
   * @param {string} token - Access token
   * @returns {Object} - { valid, user, sessionId } or { valid: false, error }
   */
  async validateSession(token) {
    try {
      if (await this._isBlacklisted(this.hashToken(token))) {
        throw new Error('Token has been invalidated');
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Refresh tokens must never be usable as API access tokens
      if (decoded.type !== 'access') {
        throw new Error('Token is not a valid access token');
      }

      const session = await this._getSession(decoded.sessionId);

      if (!session || !session.isActive) {
        throw new Error('Session not found or inactive');
      }

      const now = new Date();
      if (now - session.lastActivity > this.sessionTimeout) {
        await this.invalidateSession(decoded.sessionId);
        throw new Error('Session expired');
      }

      // Update last activity
      session.lastActivity = now;
      await this._putSession(decoded.sessionId, session);

      return {
        valid: true,
        user: decoded,
        sessionId: decoded.sessionId
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Rotate session tokens
   * @param {string} sessionId - Current session ID
   * @param {Object} user - User object
   * @returns {Object} - New tokens
   */
  async rotateSession(sessionId, user) {
    const session = await this._getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Blacklist old tokens
    await this._blacklist(session.accessToken);
    await this._blacklist(session.refreshToken);

    const tokenPayload = {
      userId: user._id,
      sessionId,
      role: user.role,
      isVerified: user.isVerified,
      deviceInfo: session.deviceInfo
    };

    const accessToken = this.generateAccessToken(tokenPayload);
    const refreshToken = this.generateRefreshToken(tokenPayload);

    session.accessToken = this.hashToken(accessToken);
    session.refreshToken = this.hashToken(refreshToken);
    session.lastActivity = new Date();
    await this._putSession(sessionId, session);

    return { accessToken, refreshToken };
  }

  /**
   * Exchange a refresh token for a new access+refresh pair.
   * Detects refresh-token reuse (a token already superseded by rotation) and
   * treats it as theft: the whole session is killed rather than just denying
   * the request, so a stolen-and-replayed refresh token can't keep retrying.
   * @param {string} token - Refresh token presented by the client
   * @returns {Object} - { valid, accessToken, refreshToken, expiresIn, error }
   */
  async refreshSession(token) {
    try {
      // Verify signature/expiry before the blacklist check — a blacklist hit
      // needs the decoded sessionId to kill the session (see below), and a
      // forged/expired token shouldn't be able to trigger that.
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.type !== 'refresh') {
        throw new Error('Token is not a valid refresh token');
      }

      if (await this._isBlacklisted(this.hashToken(token))) {
        // A valid-signature refresh token that's already blacklisted means it
        // was already rotated away (rotateSession blacklists the token it
        // supersedes) and is now being replayed — reuse/theft. Kill the
        // session so the legitimately-rotated token that replaced it is
        // invalidated too, not just this request denied.
        await this.invalidateSession(decoded.sessionId);
        throw new Error('Refresh token reuse detected');
      }

      const session = await this._getSession(decoded.sessionId);
      if (!session || !session.isActive) {
        throw new Error('Session not found or inactive');
      }

      if (this.hashToken(token) !== session.refreshToken) {
        // Defense in depth: valid, non-blacklisted token that still doesn't
        // match the session's current refresh hash shouldn't be reachable,
        // but treat it the same as a confirmed reuse if it ever happens.
        await this.invalidateSession(decoded.sessionId);
        throw new Error('Refresh token reuse detected');
      }

      const now = new Date();
      if (now - session.lastActivity > this.sessionTimeout) {
        await this.invalidateSession(decoded.sessionId);
        throw new Error('Session expired');
      }

      const user = await User.findById(decoded.userId);
      if (!user) {
        await this.invalidateSession(decoded.sessionId);
        throw new Error('User not found');
      }

      if (!user.isActive) {
        // A suspended account shouldn't be able to mint a fresh access token
        // even though authenticateToken's own isActive check would reject any
        // request made with it — kill the session outright instead of leaving
        // a live-but-useless token pair lying around.
        await this.invalidateSession(decoded.sessionId);
        throw new Error('Account has been suspended');
      }

      const newSession = await this.rotateSession(decoded.sessionId, user);

      return {
        valid: true,
        accessToken: newSession.accessToken,
        refreshToken: newSession.refreshToken,
        expiresIn: authConfig.accessTokenExpiresIn
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Invalidate a specific session
   * @param {string} sessionId - Session ID to invalidate
   */
  async invalidateSession(sessionId) {
    const session = await this._getSession(sessionId);
    if (session) {
      await this._blacklist(session.accessToken);
      await this._blacklist(session.refreshToken);
      await this._deleteSession(sessionId);
    }
  }

  /**
   * Invalidate all sessions for a user
   * @param {string} userId - User ID
   */
  async invalidateUserSessions(userId) {
    const sessionIds = await this._getUserSessionIds(userId);
    for (const sessionId of sessionIds) {
      await this.invalidateSession(sessionId);
    }
  }

  /**
   * Get active sessions for a user
   * @param {string} userId - User ID
   * @returns {Array} - Array of active sessions
   */
  async getUserSessions(userId) {
    const sessionIds = await this._getUserSessionIds(userId);
    const sessions = [];
    for (const sessionId of sessionIds) {
      const session = await this._getSession(sessionId);
      if (session && session.userId === userId.toString() && session.isActive) {
        sessions.push({
          sessionId,
          deviceInfo: session.deviceInfo,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity
        });
      }
    }
    return sessions;
  }

  /**
   * Cleanup old sessions for a user (keep only the most recent ones)
   * @param {string} userId - User ID
   */
  async cleanupUserSessions(userId) {
    const userSessions = await this.getUserSessions(userId);

    if (userSessions.length > this.maxSessionsPerUser) {
      userSessions.sort((a, b) => b.lastActivity - a.lastActivity);

      const sessionsToRemove = userSessions.slice(this.maxSessionsPerUser);
      for (const session of sessionsToRemove) {
        await this.invalidateSession(session.sessionId);
      }
    }
  }

  /**
   * Generate secure session ID
   * @returns {string} - Unique session ID
   */
  generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate access token
   * @param {Object} payload - Token payload
   * @returns {string} - JWT access token
   */
  generateAccessToken(payload) {
    return jwt.sign({ ...payload, type: 'access' }, process.env.JWT_SECRET, {
      expiresIn: authConfig.accessTokenExpiresIn,
      issuer: 'cab-aggregator',
      audience: 'cab-aggregator-users'
    });
  }

  /**
   * Generate refresh token
   * @param {Object} payload - Token payload
   * @returns {string} - JWT refresh token
   */
  generateRefreshToken(payload) {
    return jwt.sign({ ...payload, type: 'refresh' }, process.env.JWT_SECRET, {
      expiresIn: authConfig.refreshTokenExpiresIn,
      issuer: 'cab-aggregator',
      audience: 'cab-aggregator-users'
    });
  }

  /**
   * Hash token for secure storage
   * @param {string} token - Token to hash
   * @returns {string} - Hashed token
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Hash device information
   * @param {string} deviceInfo - Device information
   * @returns {string} - Hashed device info
   */
  hashDeviceInfo(deviceInfo) {
    return crypto.createHash('md5').update(deviceInfo).digest('hex');
  }

  /**
   * Cleanup expired sessions and blacklisted tokens.
   * No-op under Redis — keys there carry their own TTL and expire on their own.
   */
  cleanup() {
    if (this.redis) {
return;
}

    const now = new Date();
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity > this.sessionTimeout) {
        this.invalidateSession(sessionId);
      }
    }

    // Prune only entries past their own TTL — a wholesale clear() at a size
    // threshold would silently un-revoke every still-valid blacklisted token
    // (defeating logout) whenever traffic pushes the map past that size.
    const nowMs = Date.now();
    for (const [hash, expiresAtMs] of this.blacklistedTokens.entries()) {
      if (expiresAtMs <= nowMs) {
        this.blacklistedTokens.delete(hash);
      }
    }
  }

  /**
   * Get session statistics
   * @returns {Object} - Session statistics
   */
  async getStats() {
    if (this.redis) {
      // ponytail: SCAN-based counts — fine for a low-traffic admin stats endpoint,
      // would need a maintained counter if this ever became a hot path.
      const [activeSessions, blacklistedTokens] = await Promise.all([
        this._scanCount(`${SESSION_PREFIX}*`),
        this._scanCount(`${BLACKLIST_PREFIX}*`)
      ]);
      return {
        activeSessions,
        blacklistedTokens,
        timestamp: new Date().toISOString()
      };
    }

    return {
      activeSessions: this.activeSessions.size,
      blacklistedTokens: this.blacklistedTokens.size,
      timestamp: new Date().toISOString()
    };
  }

  // ---- storage backends (Redis when configured, else in-memory) ----

  // Each Redis call below is wrapped in withRedisTimeout (P-006) so a stale
  // connection rejects fast instead of hanging the request indefinitely; the
  // rejection propagates up to validateSession's existing try/catch, which
  // already returns { valid: false, error } — no new error paths. Unlike the
  // rate limiter's boot-time SCRIPT LOAD (see security.js), every call here is
  // only ever made on-demand inside an already-awaited request-handling chain,
  // never fired eagerly/unawaited at construction, so there's no unhandled-
  // rejection risk from wrapping them.
  async _putSession(sessionId, sessionData) {
    if (this.redis) {
      const ttlSeconds = Math.floor(this.sessionTimeout / 1000);
      await withRedisTimeout(this.redis.set(`${SESSION_PREFIX}${sessionId}`, JSON.stringify(sessionData), 'EX', ttlSeconds), undefined, 'session:set');
      await withRedisTimeout(this.redis.sadd(`${USER_SESSIONS_PREFIX}${sessionData.userId}`, sessionId), undefined, 'session:sadd');
      return;
    }
    this.activeSessions.set(sessionId, sessionData);
  }

  async _getSession(sessionId) {
    if (this.redis) {
      const raw = await withRedisTimeout(this.redis.get(`${SESSION_PREFIX}${sessionId}`), undefined, 'session:get');
      if (!raw) {
return null;
}
      const session = JSON.parse(raw);
      session.createdAt = new Date(session.createdAt);
      session.lastActivity = new Date(session.lastActivity);
      return session;
    }
    return this.activeSessions.get(sessionId) || null;
  }

  async _deleteSession(sessionId) {
    if (this.redis) {
      const session = await this._getSession(sessionId);
      await withRedisTimeout(this.redis.del(`${SESSION_PREFIX}${sessionId}`), undefined, 'session:del');
      if (session) {
        await withRedisTimeout(this.redis.srem(`${USER_SESSIONS_PREFIX}${session.userId}`, sessionId), undefined, 'session:srem');
      }
      return;
    }
    this.activeSessions.delete(sessionId);
  }

  async _getUserSessionIds(userId) {
    const userIdStr = userId.toString();
    if (this.redis) {
      return withRedisTimeout(this.redis.smembers(`${USER_SESSIONS_PREFIX}${userIdStr}`), undefined, 'session:smembers');
    }
    const ids = [];
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.userId === userIdStr) {
ids.push(sessionId);
}
    }
    return ids;
  }

  async _blacklist(hashedToken) {
    if (this.redis) {
      await withRedisTimeout(this.redis.set(`${BLACKLIST_PREFIX}${hashedToken}`, '1', 'EX', BLACKLIST_TTL_SECONDS), undefined, 'blacklist:set');
      return;
    }
    this.blacklistedTokens.set(hashedToken, Date.now() + BLACKLIST_TTL_SECONDS * 1000);
  }

  async _isBlacklisted(hashedToken) {
    if (this.redis) {
      return (await withRedisTimeout(this.redis.exists(`${BLACKLIST_PREFIX}${hashedToken}`), undefined, 'blacklist:exists')) === 1;
    }
    const expiresAtMs = this.blacklistedTokens.get(hashedToken);
    if (expiresAtMs === undefined) {
      return false;
    }
    if (expiresAtMs <= Date.now()) {
      this.blacklistedTokens.delete(hashedToken);
      return false;
    }
    return true;
  }

  async _scanCount(pattern) {
    let cursor = '0';
    let count = 0;
    do {
      const [nextCursor, keys] = await withRedisTimeout(this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100), undefined, 'scan');
      cursor = nextCursor;
      count += keys.length;
    } while (cursor !== '0');
    return count;
  }
}

// Create singleton instance
const sessionManager = new SessionManager();

// Only start cleanup interval outside of test environment to avoid Jest open handles
let __cleanupIntervalId = null;
if (process.env.NODE_ENV !== 'test') {
  __cleanupIntervalId = setInterval(() => {
    sessionManager.cleanup();
  }, 60 * 60 * 1000);
}

// Allow tests to explicitly stop the interval if they switch NODE_ENV midway
sessionManager._stopCleanup = () => {
  if (__cleanupIntervalId) {
    clearInterval(__cleanupIntervalId);
    __cleanupIntervalId = null;
  }
};

module.exports = sessionManager;
