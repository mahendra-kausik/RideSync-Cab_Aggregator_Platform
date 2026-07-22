const { Ride } = require('../models');
const { MatchingService, FareService } = require('../services');
const socketService = require('../services/socketService');
const mongoose = require('mongoose');

/**
 * Ride Controller
 * Handles ride booking, management, and status updates
 * Implements fare estimation, driver matching, and ride history
 */

class RideController {
  /**
   * Book a new ride
   * POST /api/rides/book
   */
  static async bookRide(req, res) {
    try {
      const { pickup, destination, specialInstructions } = req.body;
      const riderId = req.user._id;

      // Validate coordinates are within reasonable bounds
      const pickupCoords = pickup.coordinates.coordinates;
      const destCoords = destination.coordinates.coordinates;

      console.log('🔍 Debug - Pickup coordinates:', pickupCoords);
      console.log('🔍 Debug - Destination coordinates:', destCoords);
      console.log('🔍 Debug - Pickup validation:', RideController.validateCoordinates(pickupCoords));
      console.log('🔍 Debug - Destination validation:', RideController.validateCoordinates(destCoords));

      if (!RideController.validateCoordinates(pickupCoords) ||
        !RideController.validateCoordinates(destCoords)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_COORDINATES',
            message: 'Pickup and destination coordinates must be valid',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Check if user has any active rides
      const activeRide = await Ride.findOne({
        riderId,
        status: { $in: ['requested', 'matched', 'accepted', 'in_progress'] }
      });

      console.log('🔍 Debug - Active ride check:', activeRide ? 'Found active ride' : 'No active ride');
      console.log('🔍 Debug - User ID:', riderId);

      if (activeRide) {
        console.log('🔍 Debug - Active ride details:', activeRide);
        return res.status(400).json({
          success: false,
          error: {
            code: 'ACTIVE_RIDE_EXISTS',
            message: 'You already have an active ride',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Calculate distance and duration
      const distance = RideController.calculateDistance(pickupCoords, destCoords);
      const duration = RideController.estimateDuration(distance);

      console.log('🔍 Debug - Calculated distance:', distance);
      console.log('🔍 Debug - Calculated duration:', duration);

      // Calculate fare using FareService
      const fareBreakdown = FareService.calculateFare(distance, duration);

      // Create ride
      const ride = new Ride({
        riderId,
        pickup,
        destination,
        estimatedDistance: distance,
        estimatedDuration: duration,
        fare: {
          estimated: fareBreakdown.totalFare,
          breakdown: fareBreakdown
        },
        specialInstructions: specialInstructions || null
      });

      await ride.save();

      // Populate rider information
      await ride.populate('riderId', 'profile.name phone');

      // Initiate driver matching process with improved error handling
      setTimeout(async () => {
        try {
          // Check if DB is still connected before attempting matching
          if (mongoose.connection.readyState !== 1) {
            console.warn('⚠️ Database not connected - skipping driver matching');
            return;
          }

          const matchingResult = await MatchingService.findNearestDriver(
            pickupCoords[0],
            pickupCoords[1],
            ride._id
          );

          if (matchingResult.success) {
            console.log(`✅ Driver matched for ride ${ride._id}:`, matchingResult.driver.profile.name);
            // In a real application, you would emit Socket.IO events here
          } else {
            console.log(`❌ No drivers found for ride ${ride._id}:`, matchingResult.message);
            // Update ride status to indicate no drivers available
            try {
              // Check DB connection again before update
              if (mongoose.connection.readyState !== 1) {
                return;
              }

              await Ride.findByIdAndUpdate(ride._id, {
                $set: { 'metadata.noDriversAvailable': true },
                $push: {
                  'timeline.events': {
                    type: 'NO_DRIVERS_AVAILABLE',
                    timestamp: new Date(),
                    message: matchingResult.message
                  }
                }
              });
            } catch (updateError) {
              console.error('Failed to update ride with no drivers status:', updateError);
            }
          }
        } catch (matchingError) {
          console.error('❌ Driver matching failed with error:', matchingError);
          // Log the error and update ride status
          try {
            // Check DB connection before update
            if (mongoose.connection.readyState !== 1) {
              return;
            }

            await Ride.findByIdAndUpdate(ride._id, {
              $set: { 'metadata.matchingError': matchingError.message },
              $push: {
                'timeline.events': {
                  type: 'MATCHING_ERROR',
                  timestamp: new Date(),
                  error: matchingError.message
                }
              }
            });
          } catch (updateError) {
            console.error('Failed to log matching error:', updateError);
          }
        }
      }, 1000); // Small delay to allow response to be sent first

      res.status(201).json({
        success: true,
        data: {
          ride,
          message: 'Ride booked successfully. Searching for nearby drivers...'
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Book ride error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RIDE_BOOKING_FAILED',
          message: 'Failed to book ride',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Get fare estimation
   * POST /api/rides/estimate
   */
  static async getFareEstimate(req, res) {
    try {
      const { pickup, destination } = req.body;

      const pickupCoords = pickup.coordinates;
      const destCoords = destination.coordinates;

      // Validate coordinates
      if (!RideController.validateCoordinates(pickupCoords) ||
        !RideController.validateCoordinates(destCoords)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_COORDINATES',
            message: 'Invalid coordinates provided',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Calculate distance and duration
      const distance = RideController.calculateDistance(pickupCoords, destCoords);
      const duration = RideController.estimateDuration(distance);

      // Minimum distance validation (100 meters = 0.1 km)
      if (distance < 0.1) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DISTANCE',
            message: 'Pickup and destination are too close. Minimum distance is 100 meters.',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Calculate fare using FareService
      const fareBreakdown = FareService.calculateFare(distance, duration);

      res.json({
        success: true,
        data: {
          distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
          estimatedDuration: Math.round(duration),
          fare: fareBreakdown,
          currency: 'USD'
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Fare estimation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FARE_ESTIMATION_FAILED',
          message: 'Failed to calculate fare estimate',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Update ride status
   * PUT /api/rides/:id/status
   */
  static async updateRideStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;
      const userId = req.user._id;
      const userRole = req.user.role;

      // Find ride
      let ride = await Ride.findById(id);
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
      const isRider = ride.riderId.toString() === userId.toString();
      const isDriver = ride.driverId && ride.driverId.toString() === userId.toString();
      const isAdmin = userRole === 'admin';

      if (!isRider && !isDriver && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: 'You are not authorized to update this ride',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Validate status transitions based on user role
      if (!RideController.canUpdateStatus(ride.status, status, userRole, isRider, isDriver)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot transition from ${ride.status} to ${status}`,
            timestamp: new Date().toISOString()
          }
        });
      }

      // Update ride status
      try {
        // Atomically transition status, guarded on the status we just validated against,
        // so a concurrent duplicate request can't run this transition (and its side effects) twice
        const timelineField = {
          matched: 'timeline.matchedAt',
          accepted: 'timeline.acceptedAt',
          in_progress: 'timeline.startedAt',
          completed: 'timeline.completedAt',
          cancelled: 'timeline.cancelledAt'
        }[status];

        const updateFields = { status };
        if (timelineField) {
          updateFields[timelineField] = new Date();
        }
        if (reason && status === 'cancelled') {
          updateFields.cancellationReason = reason;
        }

        const updatedRide = await Ride.findOneAndUpdate(
          { _id: id, status: ride.status },
          { $set: updateFields },
          { new: true }
        );

        if (!updatedRide) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'STATUS_UPDATE_CONFLICT',
              message: 'Ride status was changed by another request',
              timestamp: new Date().toISOString()
            }
          });
        }
        ride = updatedRide;

        // Release driver if ride is cancelled or completed
        if ((status === 'cancelled' || status === 'completed') && ride.driverId) {
          const releaseResult = await MatchingService.releaseDriver(ride.driverId);
          if (!releaseResult.success) {
            console.warn('Failed to release driver:', releaseResult.message);
          }
        }

        // Emit socket events to ride participants for real-time updates
        try {
          const payload = {
            rideId: id,
            status,
            timestamp: new Date().toISOString()
          };
          // Legacy/simple event name used by clients
          socketService.broadcastToRide(id, 'ride:status-change', payload);

          // Rich event variant used by newer clients
          socketService.broadcastToRide(id, 'ride:status-updated', {
            ...payload,
            updatedBy: userId.toString(),
            userRole,
          });
        } catch (emitErr) {
          console.warn('Socket emit failed for status update:', emitErr?.message || emitErr);
        }

        // Populate related data
        await ride.populate([
          { path: 'riderId', select: 'profile.name phone' },
          { path: 'driverId', select: 'profile.name phone driverInfo.vehicleDetails' }
        ]);

        res.json({
          success: true,
          data: {
            ride,
            message: `Ride status updated to ${status}`
          },
          timestamp: new Date().toISOString()
        });

      } catch (statusError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'STATUS_UPDATE_FAILED',
            message: statusError.message,
            timestamp: new Date().toISOString()
          }
        });
      }

    } catch (error) {
      console.error('Update ride status error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATUS_UPDATE_ERROR',
          message: 'Failed to update ride status',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Get pending ride requests for driver
   * GET /api/rides/driver/pending
   */
  static async getPendingRides(req, res) {
    try {
      const { lat, lng, radius = 10 } = req.query;

      // Validate driver location if provided
      if (lat && lng) {
        const coordinates = [parseFloat(lng), parseFloat(lat)];
        if (!RideController.validateCoordinates(coordinates)) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_COORDINATES',
              message: 'Invalid driver location coordinates',
              timestamp: new Date().toISOString()
            }
          });
        }

        // Find rides near driver location
        const rides = await Ride.find({
          status: 'requested',
          'pickup.coordinates': {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: coordinates
              },
              $maxDistance: radius * 1000 // Convert km to meters
            }
          }
        })
          .populate('riderId', 'profile.name phone')
          .sort({ createdAt: 1 })
          .limit(10);

        res.json({
          success: true,
          data: {
            rides,
            count: rides.length,
            radius: radius
          },
          timestamp: new Date().toISOString()
        });

      } else {
        // Return all pending rides if no location provided
        const rides = await Ride.find({ status: 'requested' })
          .populate('riderId', 'profile.name phone')
          .sort({ createdAt: 1 })
          .limit(20);

        res.json({
          success: true,
          data: {
            rides,
            count: rides.length
          },
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('Get pending rides error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_PENDING_RIDES_FAILED',
          message: 'Failed to fetch pending rides',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Accept a ride request
   * POST /api/rides/:id/accept
   */
  static async acceptRide(req, res) {
    try {
      const { id } = req.params;
      const driverId = req.user._id;

      // Use MatchingService for atomic assignment with conflict resolution
      const assignmentResult = await MatchingService.assignRideToDriver(id, driverId);

      if (!assignmentResult.success) {
        const statusCode = assignmentResult.error === 'ASSIGNMENT_CONFLICT' ? 409 : 400;
        return res.status(statusCode).json({
          success: false,
          error: {
            code: assignmentResult.error,
            message: assignmentResult.message,
            timestamp: new Date().toISOString()
          }
        });
      }

      // Fetch the updated ride with populated data
      const ride = await Ride.findById(id)
        .populate([
          { path: 'riderId', select: 'profile.name phone' },
          { path: 'driverId', select: 'profile.name phone driverInfo.vehicleDetails' }
        ]);

      // Emit socket event to notify rider that driver was assigned
      if (ride.driverId) {
        socketService.broadcastToRide(id, 'ride:driver-assigned', {
          rideId: id,
          driver: ride.driverId,
          estimatedArrival: 5 // Default 5 minutes, can be calculated based on distance
        });

        // Also emit status change event
        socketService.broadcastToRide(id, 'ride:status-change', {
          rideId: id,
          status: 'accepted',
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: {
          ride,
          message: 'Ride accepted successfully',
          assignedAt: assignmentResult.assignedAt
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Accept ride error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RIDE_ACCEPT_FAILED',
          message: 'Failed to accept ride',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Get ride history with filtering and pagination
   * GET /api/rides/history
   */
  static async getRideHistory(req, res) {
    try {
      const userId = req.user._id;
      const userRole = req.user.role;
      const {
        page = 1,
        limit = 10,
        status,
        startDate,
        endDate,
        userId: filterUserId
      } = req.query;

      // Build query
      const query = {};

      // Role-based filtering
      if (userRole === 'admin') {
        // Admin can see all rides, optionally filter by user
        if (filterUserId) {
          query.$or = [
            { riderId: filterUserId },
            { driverId: filterUserId }
          ];
        }
      } else if (userRole === 'driver') {
        query.driverId = userId;
      } else {
        query.riderId = userId;
      }

      // Status filtering
      if (status) {
        query.status = status;
      }

      // Date range filtering
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          query.createdAt.$lte = new Date(endDate);
        }
      }

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const limitNum = parseInt(limit);

      // Execute query
      const [rides, total] = await Promise.all([
        Ride.find(query)
          .populate('riderId', 'profile.name phone')
          .populate('driverId', 'profile.name phone driverInfo.vehicleDetails')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum),
        Ride.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          rides,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limitNum),
            totalRides: total,
            hasNext: skip + limitNum < total,
            hasPrev: parseInt(page) > 1
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get ride history error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_HISTORY_FAILED',
          message: 'Failed to fetch ride history',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Find and assign nearest driver to a ride
   * POST /api/rides/:id/find-driver
   */
  static async findDriver(req, res) {
    try {
      const { id } = req.params;
      const { radius } = req.body;

      // Find the ride
      const ride = await Ride.findById(id);
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

      // Check if ride is in correct status for driver matching
      if (ride.status !== 'requested') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_RIDE_STATUS',
            message: `Cannot find driver for ride with status: ${ride.status}`,
            timestamp: new Date().toISOString()
          }
        });
      }

      // Use MatchingService to find nearest driver
      const pickupCoords = ride.pickup.coordinates.coordinates;
      const matchingResult = await MatchingService.findNearestDriver(
        pickupCoords[0],
        pickupCoords[1],
        ride._id,
        radius ? radius * 1000 : undefined // Convert km to meters if provided
      );

      if (matchingResult.success) {
        // Fetch updated ride with populated data
        const updatedRide = await Ride.findById(id)
          .populate([
            { path: 'riderId', select: 'profile.name phone' },
            { path: 'driverId', select: 'profile.name phone driverInfo.vehicleDetails' }
          ]);

        res.json({
          success: true,
          data: {
            ride: updatedRide,
            matchingDetails: {
              driver: matchingResult.driver,
              searchRadius: matchingResult.searchRadius / 1000, // Convert back to km
              totalDriversFound: matchingResult.totalDriversFound,
              assignedAt: matchingResult.assignedAt,
              fallbackAssignment: matchingResult.fallbackAssignment || false
            },
            message: 'Driver found and assigned successfully'
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(404).json({
          success: false,
          error: {
            code: matchingResult.error,
            message: matchingResult.message,
            details: {
              maxRadiusSearched: matchingResult.maxRadiusSearched / 1000, // Convert to km
              searchedAt: matchingResult.searchedAt
            },
            timestamp: new Date().toISOString()
          }
        });
      }

    } catch (error) {
      console.error('Find driver error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DRIVER_MATCHING_FAILED',
          message: 'Failed to find driver',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Get available drivers count in area
   * GET /api/rides/drivers/available
   */
  static async getAvailableDriversCount(req, res) {
    try {
      const { lat, lng, radius = 5 } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_COORDINATES',
            message: 'Latitude and longitude are required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const coordinates = [parseFloat(lng), parseFloat(lat)];
      if (!RideController.validateCoordinates(coordinates)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_COORDINATES',
            message: 'Invalid coordinates provided',
            timestamp: new Date().toISOString()
          }
        });
      }

      const count = await MatchingService.getAvailableDriversCount(
        coordinates[0],
        coordinates[1],
        radius * 1000 // Convert km to meters
      );

      res.json({
        success: true,
        data: {
          availableDrivers: count,
          searchRadius: radius,
          location: {
            latitude: parseFloat(lat),
            longitude: parseFloat(lng)
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get available drivers count error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DRIVER_COUNT_FAILED',
          message: 'Failed to get available drivers count',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Get single ride details
   * GET /api/rides/:id
   */
  static async getRideDetails(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user._id;
      const userRole = req.user.role;

      const ride = await Ride.findById(id)
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
            message: 'You are not authorized to view this ride',
            timestamp: new Date().toISOString()
          }
        });
      }

      res.json({
        success: true,
        data: { ride },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get ride details error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_RIDE_FAILED',
          message: 'Failed to fetch ride details',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  // Helper methods

  /**
   * Validate coordinates are within reasonable bounds
   */
  static validateCoordinates(coords) {
    if (!Array.isArray(coords) || coords.length !== 2) {
      return false;
    }
    const [lng, lat] = coords;
    return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  static calculateDistance(coord1, coord2) {
    const [lng1, lat1] = coord1;
    const [lng2, lat2] = coord2;

    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  }

  /**
   * Estimate duration based on distance (assuming average speed)
   */
  static estimateDuration(distance) {
    const averageSpeed = 30; // km/h average city speed
    return (distance / averageSpeed) * 60; // Duration in minutes
  }

  /**
   * Check if status transition is allowed for user role
   */
  static canUpdateStatus(currentStatus, newStatus, userRole, isRider, isDriver) {
    const transitions = {
      'requested': {
        'cancelled': ['rider', 'admin'],
        'matched': ['system'] // Only system/driver acceptance
      },
      'matched': {
        'accepted': ['driver'],
        'cancelled': ['rider', 'driver', 'admin']
      },
      'accepted': {
        'in_progress': ['driver'],
        'cancelled': ['rider', 'driver', 'admin']
      },
      'in_progress': {
        'completed': ['driver'],
        // Allow driver to cancel an in-progress ride (e.g., emergency/issue)
        // Admin remains allowed as well
        'cancelled': ['driver', 'admin']
      },
      'completed': {},
      'cancelled': {}
    };

    const allowedRoles = transitions[currentStatus]?.[newStatus] || [];

    if (allowedRoles.includes('rider') && isRider) {
      return true;
    }
    if (allowedRoles.includes('driver') && isDriver) {
      return true;
    }
    if (allowedRoles.includes('admin') && userRole === 'admin') {
      return true;
    }

    return false;
  }

  /**
   * Complete a ride
   * PUT /api/rides/:id/complete
   */
  static async completeRide(req, res) {
    try {
      const { id } = req.params;
      const { actualDistance, actualDuration } = req.body;
      const userId = req.user._id;
      const userRole = req.user.role;

      // Find ride
      let ride = await Ride.findById(id);
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

      // Check authorization - only driver can complete ride
      if (userRole !== 'driver' || !ride.driverId || ride.driverId.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: 'Only the assigned driver can complete this ride',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Validate ride status
      if (ride.status !== 'in_progress') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_RIDE_STATUS',
            message: 'Only rides in progress can be completed',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Update ride with actual values and complete status
      if (actualDistance && actualDistance > 0) {
        ride.actualDistance = actualDistance;
      }
      if (actualDuration && actualDuration > 0) {
        ride.actualDuration = actualDuration;
      }

      // Recalculate final fare if actual values provided
      if (ride.actualDistance || ride.actualDuration) {
        const distance = ride.actualDistance || ride.estimatedDistance;
        const duration = ride.actualDuration || ride.estimatedDuration;
        const fareBreakdown = FareService.calculateFare(distance, duration);
        ride.fare.breakdown = fareBreakdown;
        ride.fare.final = fareBreakdown.totalFare;
      } else {
        ride.fare.final = ride.fare.estimated;
      }

      // Atomically transition to completed, guarded on still being in_progress, so a
      // concurrent duplicate completion request can't re-run fare calc / driver release / broadcasts
      const updatedRide = await Ride.findOneAndUpdate(
        { _id: id, status: 'in_progress' },
        {
          $set: {
            actualDistance: ride.actualDistance,
            actualDuration: ride.actualDuration,
            'fare.breakdown': ride.fare.breakdown,
            'fare.final': ride.fare.final,
            status: 'completed',
            'timeline.completedAt': new Date()
          }
        },
        { new: true }
      );

      if (!updatedRide) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'STATUS_UPDATE_CONFLICT',
            message: 'Ride was already completed by another request',
            timestamp: new Date().toISOString()
          }
        });
      }
      ride = updatedRide;

      // Emit socket events to notify participants and dashboards
      try {
        const payload = {
          rideId: id,
          status: 'completed',
          timestamp: new Date().toISOString()
        };
        socketService.broadcastToRide(id, 'ride:status-change', payload);
        socketService.broadcastToRide(id, 'ride:status-updated', {
          ...payload,
          updatedBy: userId.toString(),
          userRole,
        });
      } catch (emitErr) {
        console.warn('Socket emit failed for ride completion:', emitErr?.message || emitErr);
      }

      // Release driver
      const releaseResult = await MatchingService.releaseDriver(ride.driverId);
      if (!releaseResult.success) {
        console.warn('Failed to release driver:', releaseResult.message);
      }

      // Populate related data
      await ride.populate([
        { path: 'riderId', select: 'profile.name phone' },
        { path: 'driverId', select: 'profile.name phone driverInfo.vehicleDetails' }
      ]);

      res.json({
        success: true,
        data: {
          ride,
          message: 'Ride completed successfully'
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Complete ride error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RIDE_COMPLETION_ERROR',
          message: 'Failed to complete ride',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Get driver's active ride
   * GET /api/rides/driver/active
   */
  static async getActiveRide(req, res) {
    try {
      const driverId = req.user._id;

      // Only drivers can access this endpoint
      if (req.user.role !== 'driver') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only drivers can access active ride information',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Find active ride for driver
      const activeRide = await Ride.findOne({
        driverId: driverId,
        status: { $in: ['accepted', 'in_progress'] }
      })
        .populate('riderId', 'profile.name phone')
        .sort({ 'timeline.acceptedAt': -1 });

      if (!activeRide) {
        return res.json({
          success: true,
          data: null
        });
      }

      res.json({
        success: true,
        data: activeRide
      });

    } catch (error) {
      console.error('Get active ride error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ACTIVE_RIDE_FETCH_FAILED',
          message: 'Failed to fetch active ride',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }
}

module.exports = RideController;