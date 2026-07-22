const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { AppError } = require('./errorHandler');
const securityConfig = require('../config/security');
const sessionManager = require('../utils/sessionManager');
const securityLogger = require('../utils/securityLogger');

/**
 * Advanced Security Middleware Collection
 * Implements comprehensive security measures for data protection and attack prevention
 */

/**
 * Enhanced Content Security Policy with strict directives
 */
const strictCSP = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: [
      "'self'",
      "'unsafe-inline'", // Required for some UI libraries
      'https://api.mapbox.com',
      'https://fonts.googleapis.com'
    ],
    scriptSrc: [
      "'self'",
      'https://api.mapbox.com'
    ],
    imgSrc: [
      "'self'",
      'data:',
      'https:',
      'https://api.mapbox.com'
    ],
    connectSrc: [
      "'self'",
      'https://api.mapbox.com',
      'wss:',
      'ws:'
    ],
    fontSrc: [
      "'self'",
      'https://fonts.gstatic.com'
    ],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: [],
    childSrc: ["'none'"],
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
  },
  reportOnly: process.env.NODE_ENV === 'development'
});

/**
 * Comprehensive security headers middleware
 */
const comprehensiveSecurityHeaders = (req, res, next) => {
  // Set security headers
  res.set({
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',

    // Prevent clickjacking
    'X-Frame-Options': 'DENY',

    // Enable XSS protection
    'X-XSS-Protection': '1; mode=block',

    // Strict Transport Security (HTTPS only)
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

    // Referrer policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Permissions policy
    'Permissions-Policy': 'geolocation=(self), microphone=(), camera=(), payment=(self)',

    // Cache control for sensitive pages
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',

    // Remove server information
    'Server': 'CabAggregator/1.0'
  });

  // Add CSP nonce for inline scripts if needed
  res.locals.nonce = require('crypto').randomBytes(16).toString('base64');

  next();
};

/**
 * Advanced request validation and sanitization
 */
const advancedInputValidation = (req, res, next) => {
  const suspiciousPatterns = securityConfig.validation.suspiciousPatterns;
  const maxLengths = securityConfig.validation.maxLengths;

  const validateValue = (value, fieldName) => {
    if (typeof value === 'string') {
      // Check for suspicious patterns
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(value)) {
          securityLogger.logSecurityEvent('SUSPICIOUS_INPUT_DETECTED', {
            field: fieldName,
            pattern: pattern.toString(),
            value: value.substring(0, 100), // Log first 100 chars only
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });

          throw new AppError(
            'Suspicious input detected',
            400,
            'SUSPICIOUS_ACTIVITY'
          );
        }
      }

      // Check field length limits
      if (maxLengths[fieldName] && value.length > maxLengths[fieldName]) {
        throw new AppError(
          `Field ${fieldName} exceeds maximum length of ${maxLengths[fieldName]}`,
          400,
          'FIELD_TOO_LONG'
        );
      }

      // Advanced XSS prevention
      const xssPatterns = [
        /<script[^>]*>.*?<\/script>/gi,
        /javascript:/gi,
        /vbscript:/gi,
        /on\w+\s*=/gi,
        /eval\s*\(/gi,
        /expression\s*\(/gi
      ];

      for (const pattern of xssPatterns) {
        if (pattern.test(value)) {
          securityLogger.logSecurityEvent('XSS_ATTEMPT_DETECTED', {
            field: fieldName,
            value: value.substring(0, 100),
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });

          throw new AppError(
            'Potentially malicious input detected',
            400,
            'MALICIOUS_INPUT'
          );
        }
      }
    }

    return value;
  };

  const validateObject = (obj, prefix = '') => {
    if (obj && typeof obj === 'object') {
      if (Array.isArray(obj)) {
        return obj.map((item, index) =>
          validateObject(item, `${prefix}[${index}]`)
        );
      }

      const validated = {};
      for (const [key, value] of Object.entries(obj)) {
        const fieldName = prefix ? `${prefix}.${key}` : key;
        validated[key] = validateObject(value, fieldName);
      }
      return validated;
    }

    return validateValue(obj, prefix);
  };

  // Validate request data
  if (req.body) {
    req.body = validateObject(req.body, 'body');
  }
  if (req.query) {
    req.query = validateObject(req.query, 'query');
  }
  if (req.params) {
    req.params = validateObject(req.params, 'params');
  }

  next();
};

/**
 * Token rotation middleware for enhanced session security
 */
const tokenRotationMiddleware = async (req, res, next) => {
  if (req.user && req.headers.authorization) {
    const token = req.headers.authorization.replace('Bearer ', '');

    try {
      const validation = await sessionManager.validateSession(token);

      if (validation.needsRotation && validation.newTokens) {
        // Set new tokens in response headers
        res.set({
          'X-New-Access-Token': validation.newTokens.accessToken,
          'X-New-Refresh-Token': validation.newTokens.refreshToken,
          'X-Token-Rotated': 'true'
        });

        securityLogger.logSecurityEvent('TOKEN_ROTATED', {
          userId: req.user.userId,
          sessionId: validation.sessionId,
          ip: req.ip
        });
      }
    } catch (error) {
      console.warn('Token rotation check failed:', error.message);
    }
  }

  next();
};

/**
 * Session hijacking detection
 */
const sessionHijackingDetection = (req, res, next) => {
  if (req.user && req.session) {
    const currentFingerprint = {
      userAgent: req.get('User-Agent'),
      acceptLanguage: req.get('Accept-Language'),
      acceptEncoding: req.get('Accept-Encoding')
    };

    const storedFingerprint = req.session.fingerprint;

    if (storedFingerprint) {
      // Check if fingerprint has changed significantly
      const fingerprintChanged =
        storedFingerprint.userAgent !== currentFingerprint.userAgent ||
        storedFingerprint.acceptLanguage !== currentFingerprint.acceptLanguage;

      if (fingerprintChanged) {
        securityLogger.logSecurityEvent('POTENTIAL_SESSION_HIJACK', {
          userId: req.user.userId,
          sessionId: req.user.sessionId,
          oldFingerprint: storedFingerprint,
          newFingerprint: currentFingerprint,
          ip: req.ip
        });

        // Invalidate session and require re-authentication
        sessionManager.invalidateSession(req.user.sessionId);

        throw new AppError(
          'Session security violation detected',
          401,
          'SESSION_HIJACK_DETECTED'
        );
      }
    } else {
      // Store fingerprint for new session
      req.session.fingerprint = currentFingerprint;
    }
  }

  next();
};

/**
 * Brute force protection with progressive delays
 */
const bruteForceProtection = (req, res, next) => {
  const key = `bf_${req.ip}_${req.path}`;
  const attempts = req.session[key] || 0;

  if (attempts > 0) {
    // Progressive delay: 1s, 2s, 4s, 8s, etc.
    const delay = Math.min(Math.pow(2, attempts - 1) * 1000, 30000); // Max 30s

    setTimeout(() => {
      next();
    }, delay);

    securityLogger.logSecurityEvent('BRUTE_FORCE_DELAY', {
      ip: req.ip,
      path: req.path,
      attempts,
      delay
    });
  } else {
    next();
  }
};

/**
 * API abuse detection
 */
const apiAbuseDetection = (req, res, next) => {
  const userKey = req.user ? `user_${req.user.userId}` : `ip_${req.ip}`;
  const timeWindow = 60 * 1000; // 1 minute
  const maxRequests = 100;

  // Simple in-memory tracking (use Redis in production)
  if (!global.apiUsage) {
    global.apiUsage = new Map();
  }

  const now = Date.now();
  const userUsage = global.apiUsage.get(userKey) || { requests: [], blocked: false };

  // Clean old requests
  userUsage.requests = userUsage.requests.filter(time => now - time < timeWindow);

  if (userUsage.blocked && userUsage.requests.length === 0) {
    userUsage.blocked = false;
  }

  if (userUsage.blocked) {
    throw new AppError(
      'API abuse detected. Please slow down your requests.',
      429,
      'API_ABUSE_DETECTED'
    );
  }

  userUsage.requests.push(now);

  if (userUsage.requests.length > maxRequests) {
    userUsage.blocked = true;

    securityLogger.logSecurityEvent('API_ABUSE_DETECTED', {
      identifier: userKey,
      requestCount: userUsage.requests.length,
      timeWindow,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    throw new AppError(
      'API abuse detected. Access temporarily blocked.',
      429,
      'API_ABUSE_DETECTED'
    );
  }

  global.apiUsage.set(userKey, userUsage);
  next();
};

/**
 * Secure file upload validation
 */
const secureFileUpload = (req, res, next) => {
  if (req.files || req.file) {
    const files = req.files || [req.file];
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    for (const file of files) {
      if (!allowedTypes.includes(file.mimetype)) {
        throw new AppError(
          'Invalid file type. Only JPEG, PNG, and GIF are allowed.',
          400,
          'INVALID_FILE_TYPE'
        );
      }

      if (file.size > maxSize) {
        throw new AppError(
          'File too large. Maximum size is 5MB.',
          400,
          'FILE_TOO_LARGE'
        );
      }

      // Check for malicious file content
      const buffer = file.buffer || Buffer.from('');
      const header = buffer.toString('hex', 0, 10);

      // Basic magic number validation
      const validHeaders = {
        'ffd8ff': 'jpeg',
        '89504e': 'png',
        '474946': 'gif'
      };

      const isValid = Object.keys(validHeaders).some(magic =>
        header.startsWith(magic)
      );

      if (!isValid) {
        securityLogger.logSecurityEvent('MALICIOUS_FILE_UPLOAD', {
          filename: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          header,
          ip: req.ip,
          userId: req.user?.userId
        });

        throw new AppError(
          'File appears to be corrupted or malicious.',
          400,
          'MALICIOUS_FILE'
        );
      }
    }
  }

  next();
};

/**
 * Geographic access control
 */
const geographicAccessControl = (allowedCountries = []) => {
  return (req, res, next) => {
    if (allowedCountries.length === 0) {
      return next();
    }

    // In production, use a GeoIP service
    const clientIP = req.ip;
    const country = 'US'; // Mock country detection

    if (!allowedCountries.includes(country)) {
      securityLogger.logSecurityEvent('GEOGRAPHIC_ACCESS_DENIED', {
        ip: clientIP,
        country,
        allowedCountries,
        path: req.path
      });

      throw new AppError(
        'Access denied from your geographic location.',
        403,
        'GEOGRAPHIC_ACCESS_DENIED'
      );
    }

    next();
  };
};

module.exports = {
  strictCSP,
  comprehensiveSecurityHeaders,
  advancedInputValidation,
  tokenRotationMiddleware,
  sessionHijackingDetection,
  bruteForceProtection,
  apiAbuseDetection,
  secureFileUpload,
  geographicAccessControl
};