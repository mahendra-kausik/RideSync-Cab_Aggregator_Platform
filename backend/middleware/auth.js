const AuthUtils = require('../utils/auth');
const sessionManager = require('../utils/sessionManager');
const securityLogger = require('../utils/securityLogger');
const { User } = require('../models');

/**
 * Authentication and authorization middleware
 * Implements JWT token validation and role-based access control
 */

/**
 * Enhanced middleware to authenticate JWT tokens with session management
 * Verifies token, validates session, and attaches user data to request object
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = AuthUtils.extractTokenFromHeader(authHeader);

    if (!token) {
      await securityLogger.logAuthEvent('TOKEN_MISSING', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });

      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token is required',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate session and token
    const sessionResult = await sessionManager.validateSession(token);

    if (!sessionResult.valid) {
      await securityLogger.logAuthEvent('TOKEN_INVALID', {
        error: sessionResult.error,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });

      let errorCode = 'TOKEN_VERIFICATION_FAILED';
      let errorMessage = 'Invalid or expired token';

      if (sessionResult.error.includes('expired')) {
        errorCode = 'TOKEN_EXPIRED';
        errorMessage = 'Access token has expired';
      } else if (sessionResult.error.includes('invalidated')) {
        errorCode = 'TOKEN_INVALIDATED';
        errorMessage = 'Token has been invalidated';
      }

      const response = {
        success: false,
        error: {
          code: errorCode,
          message: errorMessage,
          timestamp: new Date().toISOString()
        }
      };

      // Include new tokens if rotation occurred
      if (sessionResult.newTokens) {
        response.newTokens = sessionResult.newTokens;
      }

      return res.status(401).json(response);
    }

    // Fetch user from database to ensure account is still active
    const user = await User.findById(sessionResult.user.userId).select('-password');

    if (!user) {
      await securityLogger.logAuthEvent('USER_NOT_FOUND', {
        userId: sessionResult.user.userId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account not found',
          timestamp: new Date().toISOString()
        }
      });
    }

    if (!user.isActive) {
      await securityLogger.logAuthEvent('ACCOUNT_SUSPENDED', {
        userId: user._id,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(401).json({
        success: false,
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: 'User account has been suspended',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Attach user data to request
    req.user = user;
    req.tokenData = sessionResult.user;
    req.sessionId = sessionResult.sessionId;

    // Add new tokens to response headers if rotation occurred
    if (sessionResult.newTokens) {
      res.set('X-New-Access-Token', sessionResult.newTokens.accessToken);
      res.set('X-New-Refresh-Token', sessionResult.newTokens.refreshToken);
    }

    next();
  } catch (error) {
    await securityLogger.logAuthEvent('TOKEN_VERIFICATION_ERROR', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_VERIFICATION_FAILED',
        message: 'Token verification failed',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Middleware to authorize specific roles
 * @param {string[]} allowedRoles - Array of allowed roles
 * @returns {Function} - Express middleware function
 */
const authorizeRoles = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required before authorization',
          timestamp: new Date().toISOString()
        }
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
          timestamp: new Date().toISOString()
        }
      });
    }

    next();
  };
};

/**
 * Middleware for rider-only access
 */
const requireRider = authorizeRoles(['rider']);

/**
 * Middleware for driver-only access
 */
const requireDriver = authorizeRoles(['driver']);

/**
 * Middleware for admin-only access
 */
const requireAdmin = authorizeRoles(['admin']);

/**
 * Middleware for rider or driver access
 */
const requireRiderOrDriver = authorizeRoles(['rider', 'driver']);

/**
 * Middleware for any authenticated user
 */
const requireAuth = authenticateToken;

/**
 * Optional authentication middleware
 * Attaches user data if token is present but doesn't fail if missing
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = AuthUtils.extractTokenFromHeader(authHeader);

    if (!token) {
      return next(); // Continue without authentication
    }

    const sessionResult = await sessionManager.validateSession(token);
    if (!sessionResult.valid) {
      return next(); // Continue without authentication
    }

    const user = await User.findById(sessionResult.user.userId).select('-password');

    if (user && user.isActive) {
      req.user = user;
      req.tokenData = sessionResult.user;
      req.sessionId = sessionResult.sessionId;
    }

    next();
  } catch (error) {
    // Ignore authentication errors for optional auth
    next();
  }
};

/**
 * Middleware to check if user is verified
 */
const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      }
    });
  }

  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'ACCOUNT_NOT_VERIFIED',
        message: 'Account verification required',
        timestamp: new Date().toISOString()
      }
    });
  }

  next();
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  requireRider,
  requireDriver,
  requireAdmin,
  requireRiderOrDriver,
  requireAuth,
  optionalAuth,
  requireVerified
};