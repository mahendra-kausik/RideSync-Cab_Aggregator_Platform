/**
 * Security Configuration
 * Centralized security settings and constants
 */

const securityConfig = {
  // Authentication settings
  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshTokenExpiresIn: '7d',
    bcryptSaltRounds: 12,
    otpLength: 6,
    otpExpiryMinutes: 5,
    maxOtpAttempts: 3,
    maxLoginAttempts: 5,
    accountLockoutMinutes: 15
  },

  // Session management
  session: {
    maxSessionsPerUser: 5,
    sessionTimeoutHours: 24,
    tokenRotationHours: 12,
    cleanupIntervalMinutes: 60
  },

  // Rate limiting
  rateLimiting: {
    // Authentication endpoints
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts
      skipSuccessfulRequests: false
    },

    // OTP requests
    otp: {
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 3, // 3 requests
      skipSuccessfulRequests: false
    },

    // Ride booking
    rideBooking: {
      windowMs: 60 * 1000, // 1 minute
      max: 5, // 5 bookings
      skipSuccessfulRequests: true
    },

    // General API
    api: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // 100 requests
      skipSuccessfulRequests: true
    }
  },

  // Request limits
  requestLimits: {
    maxBodySize: '1mb',
    maxParameterLimit: 100,
    maxFileSize: '5mb'
  },

  // Encryption settings
  encryption: {
    algorithm: 'aes-256-gcm',
    keyLength: 32,
    ivLength: 16,
    tagLength: 16,
    saltLength: 32,
    pbkdf2Iterations: 100000
  },

  // Security headers
  headers: {
    contentSecurityPolicy: {
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
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    }
  },

  // CORS settings
  cors: {
    allowedOrigins: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin'
    ],
    exposedHeaders: ['X-Total-Count', 'X-New-Access-Token', 'X-New-Refresh-Token'],
    maxAge: 86400 // 24 hours
  },

  // Input validation
  validation: {
    // Suspicious patterns to detect
    suspiciousPatterns: [
      /(\b(union|select|insert|delete|update|drop|create|alter)\b.*\b(from|where|into)\b)/i,
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload|onerror|onclick/gi,
      /eval\s*\(/gi,
      /expression\s*\(/gi
    ],

    // Maximum lengths for various fields
    maxLengths: {
      name: 100,
      email: 254,
      phone: 20,
      address: 200,
      feedback: 500,
      specialInstructions: 300
    }
  },

  // Logging settings
  logging: {
    maxLogSize: 10 * 1024 * 1024, // 10MB
    maxLogFiles: 5,
    logDirectory: './logs',

    // Events to log
    securityEvents: [
      'LOGIN_SUCCESS',
      'LOGIN_FAILED',
      'REGISTRATION_SUCCESS',
      'REGISTRATION_FAILED',
      'OTP_SENT',
      'OTP_VERIFIED',
      'OTP_FAILED',
      'ACCOUNT_LOCKED',
      'MULTIPLE_FAILED_ATTEMPTS',
      'TOKEN_EXPIRED',
      'TOKEN_INVALID',
      'SESSION_HIJACK_ATTEMPT',
      'SUSPICIOUS_ACTIVITY',
      'RATE_LIMIT_VIOLATION'
    ]
  },

  // Environment-specific settings
  development: {
    enableDevEndpoints: process.env.ENABLE_DEV_ENDPOINTS === 'true',
    enableConsoleLogging: process.env.ENABLE_CONSOLE_LOGGING === 'true',
    relaxedCors: true,
    detailedErrors: true
  },

  production: {
    enableDevEndpoints: false,
    enableConsoleLogging: false,
    relaxedCors: false,
    detailedErrors: false,
    requireHttps: true,
    enableHSTS: true
  }
};

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// Validate JWT secret strength
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️  JWT_SECRET should be at least 32 characters long for security');
}

// Validate encryption key
if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
  console.warn('⚠️  ENCRYPTION_KEY should be at least 32 characters long for security');
}

module.exports = securityConfig;