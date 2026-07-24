const express = require('express');
const authController = require('../controllers/authController');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');

const {
  strictAuthRateLimiter,
  otpRequestRateLimiter
} = require('../middleware/security');

const router = express.Router();

/**
 * Authentication Routes
 * Enhanced with comprehensive validation and error handling
 */

/**
 * @route   POST /api/auth/register-phone
 * @desc    Register user with phone number and send OTP
 * @access  Public
 * @rateLimit 3 requests per 5 minutes per phone/IP
 */
router.post('/register-phone',
  otpRequestRateLimiter,
  asyncHandler(authController.registerPhone)
);

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify OTP and complete user registration
 * @access  Public
 * @rateLimit 5 requests per 15 minutes per IP
 */
router.post('/verify-otp',
  strictAuthRateLimiter,
  asyncHandler(authController.verifyOTP)
);

/**
 * @route   POST /api/auth/login-email
 * @desc    Admin login with email and password
 * @access  Public
 * @rateLimit 5 requests per 15 minutes per IP
 */
router.post('/login-email',
  strictAuthRateLimiter,
  asyncHandler(authController.loginEmail)
);

/**
 * @route   POST /api/auth/login-phone
 * @desc    Rider/Driver login with phone and password
 * @access  Public
 * @rateLimit 5 requests per 15 minutes per IP
 */
router.post('/login-phone',
  strictAuthRateLimiter,
  asyncHandler(authController.loginPhone)
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset instructions for admin users
 * @access  Public
 * @rateLimit 5 requests per 15 minutes per IP
 */
router.post('/forgot-password',
  strictAuthRateLimiter,
  asyncHandler(authController.forgotPassword)
);

/**
 * @route   GET /api/auth/dev/otp/:phone
 * @desc    Development-only endpoint to retrieve OTP for testing
 * @access  Public (Development only)
 * @rateLimit None (Development only)
 */
router.get('/dev/otp/:phone', asyncHandler(authController.getDevOTP));

/**
 * @route   GET /api/auth/verify
 * @desc    Verify access token and return user profile
 * @access  Private (Bearer token)
 */
router.get('/verify', requireAuth, asyncHandler(authController.verifyToken));

module.exports = router;