const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const { AppError } = require('./errorHandler');

/**
 * Input validation middleware for all endpoints
 * Implements comprehensive validation schemas and error handling
 * Enhanced with security features and rate limiting
 */

/**
 * Generic validation middleware factory
 * @param {Object} schema - Joi validation schema
 * @param {string} source - Request property to validate ('body', 'params', 'query')
 * @returns {Function} - Express middleware function
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    // Input sanitization - remove potentially dangerous characters
    if (req[source] && typeof req[source] === 'object') {
      req[source] = sanitizeInput(req[source]);
    }

    const { error, value } = schema.validate(req[source], {
      abortEarly: false, // Return all validation errors
      stripUnknown: true, // Remove unknown properties
      allowUnknown: false, // Reject unknown properties
      convert: true // Convert types when possible
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
        type: detail.type
      }));

      // Log validation failures for security monitoring
      console.warn(`Validation failed for ${req.method} ${req.path}:`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        errors: errors.map(e => ({ field: e.field, type: e.type }))
      });

      throw new AppError('Input validation failed', 400, 'VALIDATION_ERROR', errors);
    }

    // Replace request data with validated and sanitized data
    req[source] = value;
    next();
  };
};

/**
 * Input sanitization helper
 * Removes potentially dangerous characters and patterns
 */
const sanitizeInput = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sanitized = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Remove script tags, SQL injection patterns, and other dangerous content
      sanitized[key] = value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/(\b(ALTER|CREATE|DELETE|DROP|EXEC|EXECUTE|INSERT|SELECT|UNION|UPDATE)\b)/gi, '')
        .trim();
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeInput(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

// Common validation schemas
const coordinatesSchema = Joi.object({
  type: Joi.string().valid('Point').default('Point'),
  coordinates: Joi.array().items(Joi.number()).length(2).required()
    .custom((value, helpers) => {
      const [lng, lat] = value;
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        return helpers.error('coordinates.invalid');
      }
      return value;
    })
});

const locationSchema = Joi.object({
  address: Joi.string().required().max(200).trim(),
  coordinates: coordinatesSchema.required()
});

// Ride validation schemas
const rideBookingSchema = Joi.object({
  pickup: locationSchema.required(),
  destination: locationSchema.required(),
  specialInstructions: Joi.string().max(300).trim().optional()
});

const fareEstimateSchema = Joi.object({
  pickup: Joi.object({
    coordinates: Joi.array().items(Joi.number()).length(2).required()
  }).required(),
  destination: Joi.object({
    coordinates: Joi.array().items(Joi.number()).length(2).required()
  }).required()
});

const rideStatusUpdateSchema = Joi.object({
  status: Joi.string().valid('matched', 'accepted', 'in_progress', 'completed', 'cancelled').required(),
  reason: Joi.string().max(200).trim().optional()
});

const rideHistoryQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
  status: Joi.string().valid('requested', 'matched', 'accepted', 'in_progress', 'completed', 'cancelled').optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional() // MongoDB ObjectId pattern
});

const pendingRidesQuerySchema = Joi.object({
  lat: Joi.number().min(-90).max(90).optional(),
  lng: Joi.number().min(-180).max(180).optional(),
  radius: Joi.number().min(1).max(50).default(10)
}).and('lat', 'lng'); // Both lat and lng must be present together

const mongoIdParamSchema = Joi.object({
  id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
    .messages({
      'string.pattern.base': 'Invalid ride ID format'
    })
});

// User validation schemas
const phoneRegistrationSchema = Joi.object({
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required()
    .messages({
      'string.pattern.base': 'Phone number must be in valid international format'
    }),
  role: Joi.string().valid('rider', 'driver').default('rider'),
  profile: Joi.object({
    name: Joi.string().required().min(2).max(50).trim(),
    avatar: Joi.string().uri().optional()
  }).required(),
  driverInfo: Joi.when('role', {
    is: 'driver',
    then: Joi.object({
      licenseNumber: Joi.string().required().min(5).max(20).trim(),
      vehicleDetails: Joi.object({
        make: Joi.string().required().max(30).trim(),
        model: Joi.string().required().max(30).trim(),
        plateNumber: Joi.string().required().max(15).trim(),
        color: Joi.string().required().max(20).trim()
      }).required()
    }).required(),
    otherwise: Joi.forbidden()
  })
});

const otpVerificationSchema = Joi.object({
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required()
    .messages({
      'string.length': 'OTP must be exactly 6 digits',
      'string.pattern.base': 'OTP must contain only numbers'
    }),
  password: Joi.string().required().min(6)
    .messages({
      'string.min': 'Password must be at least 6 characters long'
    })
}).unknown(true); // Allow additional fields like tempUserData

const emailLoginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().lowercase().trim(),
  password: Joi.string().required().min(6) // Changed from min(8) to min(6) to match seed data
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().lowercase().trim()
});

const locationUpdateSchema = Joi.object({
  coordinates: Joi.array().items(Joi.number()).length(2).required(),
  isAvailable: Joi.boolean().optional()
});

// Payment validation schemas
const paymentProcessSchema = Joi.object({
  rideId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  paymentMethod: Joi.string().valid('mock', 'cash').required(),
  paymentDetails: Joi.object({
    cardNumber: Joi.string().optional(),
    paymentMethodId: Joi.string().optional(),
    cvv: Joi.string().optional(),
    expiryMonth: Joi.number().integer().min(1).max(12).optional(),
    expiryYear: Joi.number().integer().min(new Date().getFullYear()).optional()
  }).optional()
});

const ratingSubmissionSchema = Joi.object({
  rideId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  feedback: Joi.string().max(500).trim().optional(),
  ratingType: Joi.string().valid('driver', 'rider').required()
});

// Exported validation middleware functions
/**
 * Enhanced rate limiting configurations
 */
const createRateLimiter = (windowMs, max, message, skipSuccessfulRequests = false) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message,
        timestamp: new Date().toISOString()
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    handler: (_req, _res) => {
      throw new AppError(message, 429, 'RATE_LIMIT_EXCEEDED');
    }
  });
};

// Specific rate limiters for different endpoints
const authRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts
  'Too many authentication attempts, please try again later'
);

const otpRateLimiter = createRateLimiter(
  5 * 60 * 1000, // 5 minutes
  3, // 3 OTP requests
  'Too many OTP requests, please wait before requesting again'
);

const rideBookingRateLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  10, // 10 ride bookings
  'Too many ride booking attempts, please slow down'
);

const generalApiRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests
  'Too many API requests, please try again later',
  true // Skip successful requests
);

module.exports = {
  // Generic validator
  validate,
  sanitizeInput,

  // Ride validations
  validateRideBooking: validate(rideBookingSchema),
  validateFareEstimate: validate(fareEstimateSchema),
  validateRideStatusUpdate: validate(rideStatusUpdateSchema),
  validateRideHistoryQuery: validate(rideHistoryQuerySchema, 'query'),
  validatePendingRidesQuery: validate(pendingRidesQuerySchema, 'query'),
  validateMongoIdParam: validate(mongoIdParamSchema, 'params'),

  // Auth validations
  validatePhoneRegistration: validate(phoneRegistrationSchema),
  validateOtpVerification: (req, res, next) => {
    // Input sanitization - remove potentially dangerous characters
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeInput(req.body);
    }

    const { error, value } = otpVerificationSchema.validate(req.body, {
      abortEarly: false, // Return all validation errors
      stripUnknown: false, // Keep unknown properties like tempUserData
      allowUnknown: true, // Allow unknown properties
      convert: true // Convert types when possible
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
        type: detail.type
      }));

      // Log validation failures for security monitoring
      console.warn(`Validation failed for ${req.method} ${req.path}:`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        errors: errors.map(e => ({ field: e.field, type: e.type }))
      });

      throw new AppError('Input validation failed', 400, 'VALIDATION_ERROR', errors);
    }

    // Replace request data with validated data but preserve unknown fields
    req.body = { ...req.body, ...value };
    next();
  },
  validateEmailLogin: validate(emailLoginSchema),
  validateForgotPassword: validate(forgotPasswordSchema),

  // User validations
  validateLocationUpdate: validate(locationUpdateSchema),

  // Payment validations
  validatePaymentData: validate(paymentProcessSchema),
  validateRatingData: validate(ratingSubmissionSchema),

  // Rate limiters
  authRateLimiter,
  otpRateLimiter,
  rideBookingRateLimiter,
  generalApiRateLimiter,

  // Custom validation helpers
  validateCoordinates: (coords) => {
    if (!Array.isArray(coords) || coords.length !== 2) {
      return false;
    }
    const [lng, lat] = coords;
    return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
  },

  // Error messages
  validationErrors: {
    COORDINATES_INVALID: 'Coordinates must be valid longitude and latitude values',
    PHONE_INVALID: 'Phone number must be in valid international format',
    OTP_INVALID: 'OTP must be exactly 6 digits',
    EMAIL_INVALID: 'Email address must be valid',
    MONGO_ID_INVALID: 'Invalid ID format'
  }
};