// Cab Aggregator Backend Server
// This is the main entry point for the backend service
// Updated to fix MongoDB connection

require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

// Import database connection
const dbConnection = require('./config/database');
const redisClient = require('./config/redis');

// Import models for testing
const { User, Ride, OTP } = require('./models');

// Import enhanced error handling
const {
  globalErrorHandler,
  asyncHandler,
  handleUnhandledRejection,
  handleUncaughtException
} = require('./middleware/errorHandler');

const gracefulDegradation = require('./services/GracefulDegradationService');
const { requestLogger, errorRequestLogger } = require('./middleware/requestLogger');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Initialize Socket.IO with CORS configuration
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Cross-instance Socket.IO delivery when Redis is configured — a ride update
// emitted on one process reaches clients connected to another. Single-process
// dev/test setups just skip this and Socket.IO uses its built-in in-memory adapter.
if (redisClient) {
  const { createAdapter } = require('@socket.io/redis-adapter');
  const pubClient = redisClient.duplicate();
  const subClient = redisClient.duplicate();
  // duplicate() returns a fresh EventEmitter — it does not inherit the
  // 'error' listener from config/redis.js, so a dropped connection here
  // would otherwise crash the process (unhandled 'error' event).
  pubClient.on('error', (err) => console.error('❌ Redis pub client error:', err.message));
  subClient.on('error', (err) => console.error('❌ Redis sub client error:', err.message));
  io.adapter(createAdapter(pubClient, subClient));
}

// Enhanced security middleware
const {
  securityHeaders,
  requestSizeLimiter,
  apiRateLimiter,
  sanitizeInput,
  corsConfig,
  securityAuditLogger,
  sessionSecurity,
  suspiciousActivityDetector
} = require('./middleware/security');

// Advanced security middleware
const {
  strictCSP,
  comprehensiveSecurityHeaders,
  advancedInputValidation,
  tokenRotationMiddleware,
  apiAbuseDetection
} = require('./middleware/advancedSecurity');

// Apply comprehensive security headers first
app.use(comprehensiveSecurityHeaders);

// Apply strict Content Security Policy
if (process.env.NODE_ENV === 'production') {
  app.use(strictCSP);
}

// Apply security headers
app.use(securityHeaders);

// Session security
app.use(sessionSecurity);

// CORS configuration with enhanced security
app.use(cors(corsConfig));

// Request size limiting
app.use(requestSizeLimiter);

// Body parsing middleware with size limits — must run before any middleware
// that inspects req.body (input validation/sanitization below reads it)
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    // Verify JSON payload integrity
    try {
      JSON.parse(buf);
    } catch (e) {
      throw new Error('Invalid JSON payload');
    }
  }
}));
app.use(express.urlencoded({
  extended: true,
  limit: '1mb',
  parameterLimit: 100 // Limit number of parameters
}));

// Advanced input validation and sanitization
app.use(advancedInputValidation);
app.use(sanitizeInput);
app.use(suspiciousActivityDetector);

// Apply rate limiting to all API routes
app.use('/api', apiRateLimiter);

// API abuse detection
app.use('/api', apiAbuseDetection);

// Security audit logging
app.use(securityAuditLogger);

// Token rotation middleware (after auth middleware)
app.use(tokenRotationMiddleware);

// Request logging middleware
app.use(requestLogger);

// Health check endpoint with enhanced monitoring
app.get('/health', asyncHandler(async (req, res) => {
  const dbStatus = dbConnection.getConnectionStatus();
  const degradationStatus = gracefulDegradation.getHealthStatus();

  const overallStatus = dbStatus.isConnected && degradationStatus.overallHealth === 'healthy'
    ? 'OK'
    : 'DEGRADED';

  res.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    service: 'cab-aggregator-backend',
    database: {
      connected: dbStatus.isConnected,
      status: dbStatus.status,
      host: dbStatus.host,
      name: dbStatus.name
    },
    externalServices: degradationStatus,
    version: '1.0.0'
  });
}));

// Import routes
const authRoutes = require('./routes/auth');
const rideRoutes = require('./routes/rides');
const paymentRoutes = require('./routes/payments');
const securityRoutes = require('./routes/security');

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/users', require('./routes/users'));
app.use('/api/payments', paymentRoutes);
app.use('/api/security', securityRoutes);

// Test routes (development only)
if (process.env.NODE_ENV === 'development') {
  app.use('/api/test', require('./routes/test-error-handling'));

  // Temporary endpoint to clear active rides
  app.post('/api/dev/clear-active-rides', asyncHandler(async (req, res) => {
    const { Ride } = require('./models');
    const result = await Ride.updateMany(
      { status: { $in: ['requested', 'matched', 'accepted', 'in_progress'] } },
      {
        status: 'cancelled',
        'timeline.cancelledAt': new Date()
      }
    );

    res.json({
      success: true,
      message: `Cancelled ${result.modifiedCount} active rides`,
      modifiedCount: result.modifiedCount
    });
  }));
}

// API root endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Cab Aggregator API is running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
      'test-models': '/api/test-models',
      auth: '/api/auth',
      rides: '/api/rides'
    }
  });
});

// Test endpoint to verify models integration
app.get('/api/test-models', asyncHandler(async (req, res) => {
  // Test database connection and models
  const userCount = await User.countDocuments();
  const rideCount = await Ride.countDocuments();
  const otpCount = await OTP.countDocuments();

  res.json({
    success: true,
    message: 'Models integration test successful',
    data: {
      database: 'Connected',
      models: {
        User: { available: true, count: userCount },
        Ride: { available: true, count: rideCount },
        OTP: { available: true, count: otpCount }
      },
      indexes: {
        User: 'Geospatial and text indexes configured',
        Ride: 'Geospatial and status indexes configured',
        OTP: 'TTL and phone indexes configured'
      }
    },
    timestamp: new Date().toISOString()
  });
}));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      timestamp: new Date().toISOString()
    }
  });
});

// Error request logging middleware
app.use(errorRequestLogger);

// Global error handling middleware (must be last)
app.use(globalErrorHandler);

// Import Socket.IO handlers
const socketHandlers = require('./services/socketService');

// Initialize Socket.IO handlers
socketHandlers.initializeSocketHandlers(io);

// Start server with database connection
async function startServer() {
  try {
    // Set up global error handlers
    handleUnhandledRejection();
    handleUncaughtException();

    // Validate security configuration
    const SecurityValidator = require('./utils/securityValidator');
    const securityValidator = new SecurityValidator();
    securityValidator.validateAll();
    securityValidator.printResults();

    // Exit if critical security issues in production
    if (process.env.NODE_ENV === 'production' && !securityValidator.isProductionReady()) {
      console.error('❌ Critical security issues detected. Cannot start in production mode.');
      process.exit(1);
    }

    // Connect to database
    await dbConnection.connect();

    // Ensure demo accounts (admin/rider/driver) exist for local development —
    // idempotent, never runs in production so it never touches the real Atlas DB
    if (process.env.NODE_ENV !== 'production') {
      const { ensureDemoAccounts } = require('./scripts/seed');
      await ensureDemoAccounts();
    }

    // Start HTTP server with Socket.IO
    server.listen(PORT, () => {
      console.log(`🚀 Backend server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔗 API base: http://localhost:${PORT}/api`);
      console.log('🔌 Socket.IO server initialized');
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('🛡️  Enhanced error handling and validation enabled');
      console.log('⚡ Circuit breakers initialized for external services');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();