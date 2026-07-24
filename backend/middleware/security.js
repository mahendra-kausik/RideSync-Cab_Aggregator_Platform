const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { AppError } = require('./errorHandler');
const redisClient = require('../config/redis');
const RedisRateLimitStore = require('../utils/redisRateLimitStore');

/**
 * Comprehensive Security Middleware
 * Implements advanced security measures for data protection and attack prevention
 */

/**
 * Enhanced Content Security Policy configuration
 */
const cspConfig = {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://api.mapbox.com', 'https://fonts.googleapis.com'],
    scriptSrc: ["'self'", 'https://api.mapbox.com'],
    imgSrc: ["'self'", 'data:', 'https:', 'https://api.mapbox.com'],
    connectSrc: ["'self'", 'https://api.mapbox.com', 'wss:', 'ws:'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
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
  }
};

/**
 * Security headers middleware using Helmet
 */
const securityHeaders = helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? cspConfig : false,
  crossOriginEmbedderPolicy: false, // Disable for development compatibility
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: false,
  hidePoweredBy: true,
  dnsPrefetchControl: { allow: false }
});

/**
 * Request size limiting middleware
 */
const requestSizeLimiter = (req, res, next) => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const contentLength = parseInt(req.get('content-length') || '0');

  if (contentLength > maxSize) {
    throw new AppError('Request entity too large', 413, 'REQUEST_TOO_LARGE');
  }

  next();
};

/**
 * Advanced rate limiting configurations
 */
const createAdvancedRateLimiter = (name, options) => {
  const {
    windowMs,
    max,
    message,
    skipSuccessfulRequests = false,
    keyGenerator = null,
    skip = null
  } = options;

  return rateLimit({
    windowMs,
    max,
    // Shared store across instances when Redis is configured; each process
    // keeps its own counters (express-rate-limit's default) otherwise. Each
    // limiter gets its own prefix — a MemoryStore instance is implicitly
    // isolated per limiter, but one shared Redis keyspace is not, so without
    // a per-limiter prefix two limiters with the same default keyGenerator
    // (IP+User-Agent) would double-count the same request against one key.
    // ponytail: fail-fast (P-006) — a stale Redis connection rejects within
    // REDIS_CMD_TIMEOUT_MS instead of hanging forever, which express-rate-limit v6
    // turns into a 500 (not fail-open; passOnStoreError fail-open is v7-only).
    // Uses our own INCR/PEXPIRE/PTTL store, not rate-limit-redis's Lua-script
    // RedisStore — that store's SCRIPT LOAD/EVALSHA path retries unconditionally
    // (and unbounded) on any error, including a deliberate timeout, defeating
    // the whole point of bounding it (see DECISIONS.md's P-006 entries).
    store: redisClient ? new RedisRateLimitStore(redisClient, `rl:${name}:`) : undefined,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message,
        timestamp: new Date().toISOString(),
        retryAfter: Math.ceil(windowMs / 1000)
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    keyGenerator: keyGenerator || ((req) => {
      // Use IP + User-Agent for more accurate rate limiting
      return `${req.ip}-${req.get('User-Agent') || 'unknown'}`;
    }),
    skip: skip || ((req) => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    }),
    handler: (req, _res) => {
      // Log rate limit violations for security monitoring
      console.warn(`Rate limit exceeded for ${req.ip} on ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      throw new AppError(message, 429, 'RATE_LIMIT_EXCEEDED');
    }
  });
};

/**
 * Strict authentication rate limiter
 */
const strictAuthRateLimiter = createAdvancedRateLimiter('auth', {
  windowMs: 5 * 60 * 1000, // 5 minutes (reduced for development)
  max: 20, // 20 attempts per window (increased for development)
  message: 'Too many authentication attempts. Please try again in 5 minutes.',
  skipSuccessfulRequests: false
});

/**
 * OTP request rate limiter with progressive delays
 */
const otpRequestRateLimiter = createAdvancedRateLimiter('otp', {
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 OTP requests per window
  message: 'Too many OTP requests. Please wait 5 minutes before requesting again.',
  keyGenerator: (req) => {
    // Rate limit by phone number if available, otherwise by IP
    const phone = req.body?.phone || req.ip;
    return `otp-${phone}`;
  }
});

/**
 * API endpoint rate limiter
 */
const apiRateLimiter = createAdvancedRateLimiter('api', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many API requests. Please try again later.',
  skipSuccessfulRequests: true
});

/**
 * Ride booking rate limiter
 */
const rideBookingRateLimiter = createAdvancedRateLimiter('ride-booking', {
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 ride bookings per minute
  message: 'Too many ride booking attempts. Please slow down.',
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, otherwise by IP
    const userId = req.user?.id || req.ip;
    return `ride-booking-${userId}`;
  }
});

/**
 * Input sanitization middleware
 */
const sanitizeInput = (req, res, next) => {
  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      return value
        // Remove script tags
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        // Remove javascript: protocol
        .replace(/javascript:/gi, '')
        // Remove event handlers
        .replace(/on\w+\s*=/gi, '')
        // Remove SQL injection patterns
        .replace(/(\b(ALTER|CREATE|DELETE|DROP|EXEC|EXECUTE|INSERT|SELECT|UNION|UPDATE|SCRIPT)\b)/gi, '')
        // Remove HTML tags except safe ones
        .replace(/<(?!\/?(b|i|em|strong|span|div|p|br)\b)[^>]*>/gi, '')
        .trim();
    }
    return value;
  };

  const sanitizeObject = (obj) => {
    if (obj && typeof obj === 'object') {
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }

      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    return sanitizeValue(obj);
  };

  // Sanitize request body, query, and params
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

/**
 * CORS configuration for production security
 */
const corsConfig = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ];

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Request-ID'
  ],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400 // 24 hours
};

/**
 * Security audit logging middleware
 */
const securityAuditLogger = (req, res, next) => {
  // Log security-relevant events
  const securityEvents = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/verify-otp',
    '/api/admin'
  ];

  const isSecurityEvent = securityEvents.some(path => req.path.startsWith(path));

  if (isSecurityEvent) {
    console.log(`Security Event: ${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
      userId: req.user?.id || 'anonymous'
    });
  }

  next();
};

/**
 * Session security middleware
 */
const sessionSecurity = (req, res, next) => {
  // Add security headers for session management
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  next();
};

/**
 * Token rotation middleware for enhanced security
 */
const tokenRotation = (req, res, next) => {
  // Add token rotation logic for long-lived sessions
  if (req.user && req.tokenData) {
    const tokenAge = Date.now() - (req.tokenData.iat * 1000);
    const rotationThreshold = 12 * 60 * 60 * 1000; // 12 hours

    if (tokenAge > rotationThreshold) {
      // Signal that token should be rotated
      res.set('X-Token-Rotation-Required', 'true');
    }
  }

  next();
};

/**
 * Suspicious activity detection
 */
const suspiciousActivityDetector = (req, res, next) => {
  const suspiciousPatterns = [
    /(\b(union|select|insert|delete|update|drop|create|alter)\b.*\b(from|where|into)\b)/i,
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload|onerror|onclick/gi
  ];

  const checkSuspicious = (value) => {
    if (typeof value === 'string') {
      return suspiciousPatterns.some(pattern => pattern.test(value));
    }
    return false;
  };

  const checkObject = (obj) => {
    if (obj && typeof obj === 'object') {
      return Object.values(obj).some(value =>
        Array.isArray(value) ? value.some(checkObject) : checkObject(value)
      );
    }
    return checkSuspicious(obj);
  };

  // Check for suspicious patterns in request data
  const hasSuspiciousContent =
    checkObject(req.body) ||
    checkObject(req.query) ||
    checkObject(req.params);

  if (hasSuspiciousContent) {
    console.warn(`Suspicious activity detected from ${req.ip}`, {
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    throw new AppError('Suspicious activity detected', 400, 'SUSPICIOUS_ACTIVITY');
  }

  next();
};

module.exports = {
  securityHeaders,
  requestSizeLimiter,
  strictAuthRateLimiter,
  otpRequestRateLimiter,
  apiRateLimiter,
  rideBookingRateLimiter,
  sanitizeInput,
  corsConfig,
  securityAuditLogger,
  sessionSecurity,
  tokenRotation,
  suspiciousActivityDetector,
  cspConfig
};