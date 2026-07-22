const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');

/**
 * Secure Session Management Utility
 * Implements token rotation, session invalidation, and security monitoring
 */

class SessionManager {
  constructor() {
    this.activeSessions = new Map(); // In-memory session store (use Redis in production)
    this.blacklistedTokens = new Set(); // Blacklisted tokens
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

    // Generate access and refresh tokens
    const accessToken = this.generateAccessToken(tokenPayload);
    const refreshToken = this.generateRefreshToken(tokenPayload);

    // Store session metadata
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

    this.activeSessions.set(sessionId, sessionData);

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
      // Check if token is blacklisted
      if (this.blacklistedTokens.has(this.hashToken(token))) {
        throw new Error('Token has been invalidated');
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Refresh tokens must never be usable as API access tokens
      if (decoded.type !== 'access') {
        throw new Error('Token is not a valid access token');
      }

      const session = this.activeSessions.get(decoded.sessionId);

      if (!session || !session.isActive) {
        throw new Error('Session not found or inactive');
      }

      // Check session timeout
      const now = new Date();
      if (now - session.lastActivity > this.sessionTimeout) {
        this.invalidateSession(decoded.sessionId);
        throw new Error('Session expired');
      }

      // Update last activity
      session.lastActivity = now;

      // Check if token rotation is needed
      const tokenAge = now - new Date(decoded.iat * 1000);
      const needsRotation = tokenAge > this.rotationThreshold;

      const result = {
        valid: true,
        user: decoded,
        sessionId: decoded.sessionId,
        needsRotation
      };

      // Rotate tokens if needed
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
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Blacklist old tokens
    this.blacklistedTokens.add(session.accessToken);
    this.blacklistedTokens.add(session.refreshToken);

    // Generate new tokens
    const tokenPayload = {
      userId: user._id,
      sessionId,
      role: user.role,
      isVerified: user.isVerified,
      deviceInfo: session.deviceInfo
    };

    const accessToken = this.generateAccessToken(tokenPayload);
    const refreshToken = this.generateRefreshToken(tokenPayload);

    // Update session
    session.accessToken = this.hashToken(accessToken);
    session.refreshToken = this.hashToken(refreshToken);
    session.lastActivity = new Date();

    return { accessToken, refreshToken };
  }

  /**
   * Invalidate a specific session
   * @param {string} sessionId - Session ID to invalidate
   */
  invalidateSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      this.blacklistedTokens.add(session.accessToken);
      this.blacklistedTokens.add(session.refreshToken);
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Invalidate all sessions for a user
   * @param {string} userId - User ID
   */
  invalidateUserSessions(userId) {
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.userId === userId.toString()) {
        this.invalidateSession(sessionId);
      }
    }
  }

  /**
   * Get active sessions for a user
   * @param {string} userId - User ID
   * @returns {Array} - Array of active sessions
   */
  getUserSessions(userId) {
    const sessions = [];
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.userId === userId.toString() && session.isActive) {
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
    const userSessions = this.getUserSessions(userId);

    if (userSessions.length > this.maxSessionsPerUser) {
      // Sort by last activity and keep only the most recent
      userSessions.sort((a, b) => b.lastActivity - a.lastActivity);

      const sessionsToRemove = userSessions.slice(this.maxSessionsPerUser);
      sessionsToRemove.forEach(session => {
        this.invalidateSession(session.sessionId);
      });
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
   * Cleanup expired sessions and blacklisted tokens
   */
  cleanup() {
    const now = new Date();

    // Remove expired sessions
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity > this.sessionTimeout) {
        this.invalidateSession(sessionId);
      }
    }

    // Clear old blacklisted tokens (keep for 7 days)
    // Note: In production, implement proper cleanup with timestamps
    if (this.blacklistedTokens.size > 10000) {
      this.blacklistedTokens.clear(); // Simple cleanup for demo
    }
  }

  /**
   * Get session statistics
   * @returns {Object} - Session statistics
   */
  getStats() {
    return {
      activeSessions: this.activeSessions.size,
      blacklistedTokens: this.blacklistedTokens.size,
      timestamp: new Date().toISOString()
    };
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