const express = require('express');
const RideController = require('../controllers/rideController');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  requireAuth,
  requireRider,
  requireDriver,
  requireRiderOrDriver,
  requireAdmin
} = require('../middleware/auth');
const {
  validateRideBooking,
  validateFareEstimate,
  validateRideStatusUpdate,
  validateRideHistoryQuery,
  validatePendingRidesQuery,
  validateMongoIdParam
} = require('../middleware/validation');

const {
  rideBookingRateLimiter
} = require('../middleware/security');

const router = express.Router();

/**
 * Ride Routes
 * Implements all ride-related endpoints with proper authentication and validation
 */

// Public routes (no authentication required)

/**
 * @route   POST /api/rides/estimate
 * @desc    Get fare estimation for a route
 * @access  Public (can be used without authentication for quick estimates)
 */
router.post('/estimate',
  validateFareEstimate,
  asyncHandler(RideController.getFareEstimate)
);

// Authenticated routes

/**
 * @route   POST /api/rides/book
 * @desc    Book a new ride
 * @access  Private (Rider only)
 */
router.post('/book',
  requireAuth,
  requireRider,
  rideBookingRateLimiter,
  validateRideBooking,
  asyncHandler(RideController.bookRide)
);

/**
 * @route   GET /api/rides/history
 * @desc    Get ride history with filtering and pagination
 * @access  Private (Rider, Driver, Admin)
 */
router.get('/history',
  requireAuth,
  validateRideHistoryQuery,
  asyncHandler(RideController.getRideHistory)
);

/**
 * @route   GET /api/rides/driver/pending
 * @desc    Get pending ride requests for driver
 * @access  Private (Driver only)
 */
router.get('/driver/pending',
  requireAuth,
  requireDriver,
  validatePendingRidesQuery,
  asyncHandler(RideController.getPendingRides)
);

/**
 * @route   GET /api/rides/driver/active
 * @desc    Get driver's active ride
 * @access  Private (Driver only)
 */
router.get('/driver/active',
  requireAuth,
  requireDriver,
  asyncHandler(RideController.getActiveRide)
);

/**
 * @route   GET /api/rides/drivers/available
 * @desc    Get count of available drivers in area
 * @access  Private (Authenticated users)
 */
router.get('/drivers/available',
  requireAuth,
  asyncHandler(RideController.getAvailableDriversCount)
);

/**
 * @route   GET /api/rides/:id
 * @desc    Get single ride details
 * @access  Private (Rider, Driver, Admin - must be associated with the ride)
 */
router.get('/:id',
  requireAuth,
  validateMongoIdParam,
  asyncHandler(RideController.getRideDetails)
);

/**
 * @route   POST /api/rides/:id/accept
 * @desc    Accept a ride request
 * @access  Private (Driver only)
 */
router.post('/:id/accept',
  requireAuth,
  requireDriver,
  validateMongoIdParam,
  asyncHandler(RideController.acceptRide)
);

/**
 * @route   POST /api/rides/:id/find-driver
 * @desc    Find and assign nearest driver to a ride
 * @access  Private (Admin only, or system use)
 */
router.post('/:id/find-driver',
  requireAuth,
  requireAdmin,
  validateMongoIdParam,
  asyncHandler(RideController.findDriver)
);

/**
 * @route   PUT /api/rides/:id/status
 * @desc    Update ride status
 * @access  Private (Rider, Driver, Admin - with role-based restrictions)
 */
router.put('/:id/status',
  requireAuth,
  requireRiderOrDriver,
  validateMongoIdParam,
  validateRideStatusUpdate,
  asyncHandler(RideController.updateRideStatus)
);

/**
 * @route   PUT /api/rides/:id/complete
 * @desc    Complete a ride
 * @access  Private (Driver only)
 */
router.put('/:id/complete',
  requireAuth,
  requireDriver,
  validateMongoIdParam,
  asyncHandler(RideController.completeRide)
);

// Admin-only routes

/**
 * @route   GET /api/rides/admin/all
 * @desc    Get all rides for admin dashboard
 * @access  Private (Admin only)
 */
router.get('/admin/all',
  requireAuth,
  requireAdmin,
  validateRideHistoryQuery,
  asyncHandler(RideController.getRideHistory)
);

module.exports = router;