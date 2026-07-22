const express = require('express');
const PaymentController = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/auth');
const { validatePaymentData, validateRatingData } = require('../middleware/validation');

const router = express.Router();

/**
 * Payment Routes
 * All routes require authentication
 */

// Process payment for completed ride
router.post('/process',
  authenticateToken,
  validatePaymentData,
  PaymentController.processPayment
);

// Submit rating for completed ride
router.post('/rate',
  authenticateToken,
  validateRatingData,
  PaymentController.submitRating
);

// Get payment history
router.get('/history',
  authenticateToken,
  PaymentController.getPaymentHistory
);

// Get receipt for specific ride
router.get('/receipt/:rideId',
  authenticateToken,
  PaymentController.getReceipt
);

module.exports = router;