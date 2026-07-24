const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');
const redis = require('../config/redis');
const { withRedisTimeout } = require('./withRedisTimeout');

/**
 * Secure Session Management Utility
 * Implements token rotation, session invalidation, and security monitoring.
 * Backed by Redis when REDIS_URL is set (so sessions survive restarts and are
 * shared across instances); falls back to an in-memory Map/Set otherwise.
 */

const SESSION_PREFIX = 'sess:';
const USER_SESSIONS_PREFIX = 'sess:user:';
const BLACKLIST_PREFIX = 'bl:';
const BLACKLIST_TTL_SECONDS = 7 * 24 * 60 * 60; // covers the longest-lived token (refresh, 7d)

class SessionManager {
  constructor() {
    this.redis = redis;
    this.activeSessions = new Map(); // in-memory fallback session store
    this.blacklistedTokens = new Set(); // in-memory fallback blacklist
    this.maxSessionsPerUser = 5; // Maximum concurrent sessions per user
    this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
    this.rotationThreshold = 12 * 60 * 60 * 1000; // 12 hours
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
      expiresIn: '24h',
      user: {
        id: user._id,
        role: user.role,
        isVerified: user.isVerified,
        profile: user.profile
      }
    };
  }

  /**
   * Validate and refresh session
   * @param {string} token - Access or refresh token
   * @returns {Object} - Validation result and new tokens if needed
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

      const tokenAge = now - new Date(decoded.iat * 1000);
      const needsRotation = tokenAge > this.rotationThreshold;

      const result = {
        valid: true,
        user: decoded,
        sessionId: decoded.sessionId,
        needsRotation
      };

      if (needsRotation) {
        const user = await User.findById(decoded.userId);
        if (user) {
          const newSession = await this.rotateSession(decoded.sessionId, user);
          result.newTokens = {
            accessToken: newSession.accessToken,
            refreshToken: newSession.refreshToken
          };
        }
      }

      return result;
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
      expiresIn: '24h',
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
      expiresIn: '7d',
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

    // Clear old blacklisted tokens (keep for 7 days)
    if (this.blacklistedTokens.size > 10000) {
      this.blacklistedTokens.clear(); // Simple cleanup for demo
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
  // already returns { valid: false, error } — no new error paths.
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
    this.blacklistedTokens.add(hashedToken);
  }

  async _isBlacklisted(hashedToken) {
    if (this.redis) {
      return (await withRedisTimeout(this.redis.exists(`${BLACKLIST_PREFIX}${hashedToken}`), undefined, 'blacklist:exists')) === 1;
    }
    return this.blacklistedTokens.has(hashedToken);
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
