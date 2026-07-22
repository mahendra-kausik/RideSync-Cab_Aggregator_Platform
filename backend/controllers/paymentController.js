const { Ride, User } = require('../models');

/**
 * Payment Controller
 * Handles payment processing, ride completion, and receipt generation
 * Implements mock payment service for local development
 */

class PaymentController {
  /**
   * Process payment for a completed ride
   * POST /api/payments/process
   */
  static async processPayment(req, res) {
    try {
      const { rideId, paymentMethod, paymentDetails } = req.body;
      const userId = req.user._id;

      // Find and validate ride
      const ride = await Ride.findById(rideId)
        .populate('riderId', 'profile.name phone')
        .populate('driverId', 'profile.name phone driverInfo.vehicleDetails');

      if (!ride) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RIDE_NOT_FOUND',
            message: 'Ride not found',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Check authorization - only rider can pay for their ride
      if (ride.riderId._id.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED_PAYMENT',
            message: 'You can only pay for your own rides',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Validate ride status
      if (ride.status !== 'completed') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_RIDE_STATUS',
            message: 'Payment can only be processed for completed rides',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Check if payment already processed
      if (ride.payment.status === 'completed') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PAYMENT_ALREADY_PROCESSED',
            message: 'Payment has already been processed for this ride',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Process payment based on method
      let paymentResult;
      switch (paymentMethod) {
        case 'mock':
          paymentResult = await PaymentController.processMockPayment(ride, paymentDetails);
          break;
        case 'cash':
          paymentResult = await PaymentController.processCashPayment(ride);
          break;
        default:
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_PAYMENT_METHOD',
              message: 'Invalid payment method specified',
              timestamp: new Date().toISOString()
            }
          });
      }

      if (!paymentResult.success) {
        // Update payment status to failed
        ride.payment.status = 'failed';
        await ride.save();

        return res.status(400).json({
          success: false,
          error: {
            code: 'PAYMENT_FAILED',
            message: paymentResult.message,
            timestamp: new Date().toISOString()
          }
        });
      }

      // Update ride payment information
      ride.payment = {
        method: paymentMethod,
        status: 'completed',
        transactionId: paymentResult.transactionId,
        processedAt: new Date()
      };

      await ride.save();

      // Generate receipt
      const receipt = PaymentController.generateReceipt(ride);

      res.json({
        success: true,
        data: {
          ride,
          receipt,
          transactionId: paymentResult.transactionId,
          message: 'Payment processed successfully'
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Process payment error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PAYMENT_PROCESSING_ERROR',
          message: 'Failed to process payment',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Submit rating for a ride
   * POST /api/payments/rate
   */
  static async submitRating(req, res) {
    try {
      const { rideId, rating, feedback, ratingType } = req.body;
      const userId = req.user._id;
      const userRole = req.user.role;

      console.log('📊 Rating submission request:', { rideId, rating, feedback, ratingType, userId: userId.toString(), userRole });

      // Validate rating
      if (!rating || rating < 1 || rating > 5) {
        console.log('❌ Invalid rating value:', rating);
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_RATING',
            message: 'Rating must be between 1 and 5',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Find ride
      const ride = await Ride.findById(rideId)
        .populate('riderId', 'profile.name phone')
        .populate('driverId', 'profile.name phone driverInfo.vehicleDetails');

      if (!ride) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RIDE_NOT_FOUND',
            message: 'Ride not found',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Validate ride status
      if (ride.status !== 'completed') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_RIDE_STATUS',
            message: 'Can only rate completed rides',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Check authorization and determine rating type
      const isRider = ride.riderId._id.toString() === userId.toString();
      const isDriver = ride.driverId && ride.driverId._id.toString() === userId.toString();

      console.log('👤 Authorization check:', {
        isRider,
        isDriver,
        riderId: ride.riderId._id.toString(),
        driverId: ride.driverId?._id?.toString(),
        userId: userId.toString(),
        ratingType
      });

      if (!isRider && !isDriver) {
        console.log('❌ Unauthorized - user is not part of this ride');
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED_RATING',
            message: 'You can only rate rides you participated in',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Update rating based on user role
      if (isRider && ratingType === 'driver') {
        if (ride.rating.driverRating) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'RATING_ALREADY_EXISTS',
              message: 'You have already rated this driver',
              timestamp: new Date().toISOString()
            }
          });
        }
        ride.rating.driverRating = rating;
        ride.rating.riderFeedback = feedback || null;
      } else if (isDriver && ratingType === 'rider') {
        if (ride.rating.riderRating) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'RATING_ALREADY_EXISTS',
              message: 'You have already rated this rider',
              timestamp: new Date().toISOString()
            }
          });
        }
        ride.rating.riderRating = rating;
        ride.rating.driverFeedback = feedback || null;
      } else {
        console.log('❌ Invalid rating type combination:', { isRider, isDriver, ratingType });
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_RATING_TYPE',
            message: `Invalid rating type "${ratingType}" for your role. ${isRider ? 'Riders can only rate drivers' : 'Drivers can only rate riders'}.`,
            timestamp: new Date().toISOString()
          }
        });
      }

      await ride.save();

      // Update user's average rating
      const targetUserId = ratingType === 'driver'
        ? (ride.driverId._id || ride.driverId)
        : (ride.riderId._id || ride.riderId);

      await PaymentController.updateUserRating(targetUserId, rating);

      res.json({
        success: true,
        data: {
          ride,
          message: 'Rating submitted successfully'
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Submit rating error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RATING_SUBMISSION_ERROR',
          message: 'Failed to submit rating',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Get payment history for user
   * GET /api/payments/history
   */
  static async getPaymentHistory(req, res) {
    try {
      const userId = req.user._id;
      const userRole = req.user.role;
      const { page = 1, limit = 10, status } = req.query;

      // Build query based on user role
      const query = {
        'payment.status': { $in: ['completed', 'failed'] }
      };

      if (userRole === 'rider') {
        query.riderId = userId;
      } else if (userRole === 'driver') {
        query.driverId = userId;
      } else if (userRole === 'admin') {
        // Admin can see all payments
      } else {
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: 'Access denied',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Add status filter if provided
      if (status) {
        query['payment.status'] = status;
      }

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const limitNum = parseInt(limit);

      // Execute query
      const [rides, total] = await Promise.all([
        Ride.find(query)
          .populate('riderId', 'profile.name phone')
          .populate('driverId', 'profile.name phone driverInfo.vehicleDetails')
          .sort({ 'payment.processedAt': -1 })
          .skip(skip)
          .limit(limitNum),
        Ride.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          payments: rides,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limitNum),
            totalPayments: total,
            hasNext: skip + limitNum < total,
            hasPrev: parseInt(page) > 1
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get payment history error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PAYMENT_HISTORY_ERROR',
          message: 'Failed to fetch payment history',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Get receipt for a specific ride
   * GET /api/payments/receipt/:rideId
   */
  static async getReceipt(req, res) {
    try {
      const { rideId } = req.params;
      const userId = req.user._id;
      const userRole = req.user.role;

      const ride = await Ride.findById(rideId)
        .populate('riderId', 'profile.name phone')
        .populate('driverId', 'profile.name phone driverInfo.vehicleDetails');

      if (!ride) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RIDE_NOT_FOUND',
            message: 'Ride not found',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Check authorization
      const isRider = ride.riderId._id.toString() === userId.toString();
      const isDriver = ride.driverId && ride.driverId._id.toString() === userId.toString();
      const isAdmin = userRole === 'admin';

      if (!isRider && !isDriver && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: 'You can only view receipts for your own rides',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Check if payment was completed
      if (ride.payment.status !== 'completed') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PAYMENT_NOT_COMPLETED',
            message: 'Receipt is only available for completed payments',
            timestamp: new Date().toISOString()
          }
        });
      }

      const receipt = PaymentController.generateReceipt(ride);

      res.json({
        success: true,
        data: { receipt },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get receipt error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RECEIPT_FETCH_ERROR',
          message: 'Failed to fetch receipt',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  // Helper methods

  /**
   * Process mock payment for local development
   */
  static async processMockPayment(ride, paymentDetails) {
    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock payment scenarios based on card number
    const cardNumber = paymentDetails?.cardNumber || '4242424242424242';

    if (cardNumber === '4000000000000002') {
      return {
        success: false,
        message: 'Your card was declined'
      };
    }

    if (cardNumber === '4000000000009995') {
      return {
        success: false,
        message: 'Insufficient funds'
      };
    }

    // Successful payment
    return {
      success: true,
      transactionId: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: 'Payment processed successfully'
    };
  }

  /**
   * Process cash payment
   */
  static async processCashPayment(_ride) {
    return {
      success: true,
      transactionId: `cash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: 'Cash payment recorded'
    };
  }

  /**
   * Generate receipt for completed ride
   */
  static generateReceipt(ride) {
    return {
      receiptId: `RCP_${ride._id}_${Date.now()}`,
      rideId: ride._id,
      date: ride.payment.processedAt || ride.timeline.completedAt,
      rider: {
        name: ride.riderId.profile.name,
        phone: ride.riderId.phone
      },
      driver: ride.driverId ? {
        name: ride.driverId.profile.name,
        vehicle: `${ride.driverId.driverInfo.vehicleDetails.color} ${ride.driverId.driverInfo.vehicleDetails.make} ${ride.driverId.driverInfo.vehicleDetails.model}`,
        plateNumber: ride.driverId.driverInfo.vehicleDetails.plateNumber
      } : null,
      trip: {
        pickup: ride.pickup.address,
        destination: ride.destination.address,
        distance: ride.actualDistance || ride.estimatedDistance,
        duration: ride.actualDuration || ride.estimatedDuration,
        startTime: ride.timeline.startedAt,
        endTime: ride.timeline.completedAt
      },
      fare: {
        baseFare: ride.fare.breakdown.baseFare,
        distanceFare: ride.fare.breakdown.distanceFare,
        timeFare: ride.fare.breakdown.timeFare,
        surgeFare: ride.fare.breakdown.surgeFare,
        total: ride.fare.final || ride.fare.estimated
      },
      payment: {
        method: ride.payment.method,
        transactionId: ride.payment.transactionId,
        status: ride.payment.status
      }
    };
  }

  /**
   * Update user's average rating
   */
  static async updateUserRating(userId, _newRating) {
    try {
      // Get all completed rides for the user
      const userRides = await Ride.find({
        $or: [
          { riderId: userId, 'rating.riderRating': { $exists: true, $ne: null } },
          { driverId: userId, 'rating.driverRating': { $exists: true, $ne: null } }
        ],
        status: 'completed'
      });

      // Calculate average rating
      let totalRating = 0;
      let ratingCount = 0;

      userRides.forEach(ride => {
        if (ride.riderId.toString() === userId.toString() && ride.rating.riderRating) {
          totalRating += ride.rating.riderRating;
          ratingCount++;
        } else if (ride.driverId && ride.driverId.toString() === userId.toString() && ride.rating.driverRating) {
          totalRating += ride.rating.driverRating;
          ratingCount++;
        }
      });

      if (ratingCount > 0) {
        const averageRating = Math.round((totalRating / ratingCount) * 100) / 100;

        await User.findByIdAndUpdate(userId, {
          'profile.rating': averageRating,
          'profile.totalRides': ratingCount
        });
      }

    } catch (error) {
      console.error('Update user rating error:', error);
    }
  }
}

module.exports = PaymentController;