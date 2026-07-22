/**
 * Test routes for error handling validation
 * These routes are for testing purposes only and should be removed in production
 */

const express = require('express');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { validate } = require('../middleware/validation');
const Joi = require('joi');

const router = express.Router();

// Only enable in development
if (process.env.NODE_ENV === 'development') {

  /**
   * Test validation error
   */
  const testValidationSchema = Joi.object({
    email: Joi.string().email().required(),
    age: Joi.number().min(18).max(100).required()
  });

  router.post('/validation-error',
    validate(testValidationSchema),
    asyncHandler(async (req, res) => {
      res.json({ success: true, message: 'Validation passed' });
    })
  );

  /**
   * Test async error
   */
  router.get('/async-error', asyncHandler(async (_req, _res) => {
    throw new Error('This is a test async error');
  }));

  /**
   * Test custom app error
   */
  router.get('/app-error', asyncHandler(async (_req, _res) => {
    throw new AppError('This is a test app error', 400, 'TEST_ERROR');
  }));

  /**
   * Test database error simulation
   */
  router.get('/db-error', asyncHandler(async (_req, _res) => {
    const error = new Error('Connection timeout');
    error.name = 'MongoNetworkError';
    throw error;
  }));

  /**
   * Test rate limit (will be caught by rate limiter)
   */
  router.get('/rate-limit-test', asyncHandler(async (req, res) => {
    res.json({ message: 'This endpoint can be used to test rate limiting' });
  }));

  /**
   * Test slow endpoint (for performance monitoring)
   */
  router.get('/slow-endpoint', asyncHandler(async (req, res) => {
    // Simulate slow operation
    await new Promise(resolve => setTimeout(resolve, 3000));
    res.json({ message: 'Slow operation completed' });
  }));

  /**
   * Test security monitoring
   */
  router.post('/security-test', asyncHandler(async (req, res) => {
    // This endpoint will trigger security monitoring for malicious payloads
    res.json({
      message: 'Security test endpoint',
      received: req.body
    });
  }));

  /**
   * Test graceful degradation
   */
  router.get('/external-service-test', asyncHandler(async (req, res) => {
    const gracefulDegradation = require('../services/GracefulDegradationService');

    // Test maps service fallback
    const mapsResult = await gracefulDegradation.getMapsData(
      () => {
        throw new Error('Maps service unavailable');
      },
      [40.7128, -74.0060] // NYC coordinates
    );

    // Test SMS service fallback
    const smsResult = await gracefulDegradation.sendSMS(
      () => {
        throw new Error('SMS service unavailable');
      },
      '+1234567890',
      'Test message'
    );

    res.json({
      message: 'Graceful degradation test',
      results: {
        maps: mapsResult,
        sms: smsResult
      }
    });
  }));

  /**
   * Test circuit breaker status
   */
  router.get('/circuit-breaker-status', asyncHandler(async (req, res) => {
    const gracefulDegradation = require('../services/GracefulDegradationService');
    const status = gracefulDegradation.getHealthStatus();

    res.json({
      message: 'Circuit breaker status',
      status
    });
  }));

  /**
   * Test error logging
   */
  router.post('/log-test', asyncHandler(async (req, res) => {
    const logger = require('../utils/logger');

    logger.info('Test info log', { test: true });
    logger.warn('Test warning log', { test: true });
    logger.error('Test error log', new Error('Test error'), { test: true });
    logger.logSecurityEvent('TEST_SECURITY_EVENT', { test: true });
    logger.logPerformance('test_operation', 1500, { test: true });

    res.json({ message: 'Logging test completed - check logs' });
  }));

  console.log('🧪 Error handling test routes enabled (development mode)');
}

module.exports = router;