/**
 * Global Error Handling Middleware
 * Implements comprehensive error handling with proper formatting and logging
 */

const fs = require('fs');
const path = require('path');

/**
 * Error types and their corresponding HTTP status codes
 */
const ERROR_TYPES = {
  VALIDATION_ERROR: 400,
  AUTHENTICATION_ERROR: 401,
  AUTHORIZATION_ERROR: 403,
  NOT_FOUND_ERROR: 404,
  CONFLICT_ERROR: 409,
  RATE_LIMIT_ERROR: 429,
  EXTERNAL_SERVICE_ERROR: 502,
  DATABASE_ERROR: 503,
  INTERNAL_SERVER_ERROR: 500
};

/**
 * Error logging utility
 */
class ErrorLogger {
  static logError(error, req = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code || 'UNKNOWN_ERROR'
      },
      request: req ? {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
        user: req.user ? { id: req.user._id, role: req.user.role } : null,
        ip: req.ip || req.connection.remoteAddress
      } : null
    };

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('🚨 Error occurred:', JSON.stringify(logEntry, null, 2));
    }

    // Log to file in production (ensure logs directory exists)
    if (process.env.NODE_ENV === 'production') {
      try {
        const logsDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }

        const logFile = path.join(logsDir, `error-${new Date().toISOString().split('T')[0]}.log`);
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
      } catch (logError) {
        console.error('Failed to write error log:', logError.message);
      }
    }
  }
}

/**
 * Format error response according to API standards
 */
const formatErrorResponse = (error, req) => {
  const timestamp = new Date().toISOString();

  // Base error response structure
  const errorResponse = {
    success: false,
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An unexpected error occurred',
      timestamp
    }
  };

  // Add request ID for tracking (if available)
  if (req.id) {
    errorResponse.error.requestId = req.id;
  }

  // Add validation details for validation errors
  if (error.code === 'VALIDATION_ERROR' && error.details) {
    errorResponse.error.details = error.details;
  }

  // Add retry information for temporary errors
  if ([502, 503, 504].includes(error.statusCode)) {
    errorResponse.error.retryAfter = 30; // seconds
  }

  // Don't expose sensitive information in production
  if (process.env.NODE_ENV === 'development' && error.stack) {
    errorResponse.error.stack = error.stack;
  }

  return errorResponse;
};

/**
 * Handle different types of errors
 */
const handleSpecificErrors = (error) => {
  // Mongoose validation errors
  if (error.name === 'ValidationError') {
    const details = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message,
      value: err.value
    }));

    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Input validation failed',
      details
    };
  }

  // Mongoose duplicate key errors
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    return {
      statusCode: 409,
      code: 'DUPLICATE_ENTRY',
      message: `${field} already exists`,
      details: [{ field, message: 'This value is already taken' }]
    };
  }

  // Mongoose cast errors (invalid ObjectId)
  if (error.name === 'CastError') {
    return {
      statusCode: 400,
      code: 'INVALID_ID_FORMAT',
      message: 'Invalid ID format provided'
    };
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return {
      statusCode: 401,
      code: 'INVALID_TOKEN',
      message: 'Invalid authentication token'
    };
  }

  if (error.name === 'TokenExpiredError') {
    return {
      statusCode: 401,
      code: 'TOKEN_EXPIRED',
      message: 'Authentication token has expired'
    };
  }

  // Database connection errors
  if (error.name === 'MongoNetworkError' || error.name === 'MongooseServerSelectionError') {
    return {
      statusCode: 503,
      code: 'DATABASE_CONNECTION_ERROR',
      message: 'Database temporarily unavailable'
    };
  }

  // Rate limiting errors
  if (error.statusCode === 429) {
    return {
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: error.message || 'Too many requests, please try again later'
    };
  }

  // External service errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return {
      statusCode: 502,
      code: 'EXTERNAL_SERVICE_ERROR',
      message: 'External service temporarily unavailable'
    };
  }

  // Default to internal server error
  return {
    statusCode: error.statusCode || 500,
    code: error.code || 'INTERNAL_SERVER_ERROR',
    message: error.message || 'An unexpected error occurred'
  };
};

/**
 * Main error handling middleware
 */
const globalErrorHandler = (error, req, res, next) => {
  // Log the error
  ErrorLogger.logError(error, req);

  // Handle specific error types
  const handledError = handleSpecificErrors(error);

  // Create standardized error response
  const errorResponse = formatErrorResponse(handledError, req);

  // Send error response
  res.status(handledError.statusCode).json(errorResponse);
};

/**
 * Async error wrapper for route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Create custom error class
 */
class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Handle unhandled promise rejections
 */
const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Promise Rejection:', reason);
    ErrorLogger.logError(new Error(`Unhandled Promise Rejection: ${reason}`));

    // Graceful shutdown
    process.exit(1);
  });
};

/**
 * Handle uncaught exceptions
 */
const handleUncaughtException = () => {
  process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
    ErrorLogger.logError(error);

    // Graceful shutdown
    process.exit(1);
  });
};

module.exports = {
  globalErrorHandler,
  asyncHandler,
  AppError,
  ErrorLogger,
  handleUnhandledRejection,
  handleUncaughtException,
  ERROR_TYPES
};