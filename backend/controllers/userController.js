const User = require('../models/User');
const Ride = require('../models/Ride');
const bcrypt = require('bcryptjs');

class UserController {
  /**
   * Get current user profile
   */
  static async getProfile(req, res) {
    try {
      const user = await User.findById(req.user._id).select('-password');

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString()
          }
        });
      }

      res.json({
        success: true,
        data: { user }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PROFILE_FETCH_FAILED',
          message: 'Failed to fetch profile',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Update user profile
   */
  static async updateProfile(req, res) {
    try {
      const userId = req.user._id;
      const { name, email } = req.body;

      const updateData = {};
      if (name) {
        updateData['profile.name'] = name;
      }
      if (email) {
        updateData.email = email;
      }

      const user = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      res.json({
        success: true,
        data: { user },
        message: 'Profile updated successfully'
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PROFILE_UPDATE_FAILED',
          message: 'Failed to update profile',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Update driver profile (including vehicle info)
   */
  static async updateDriverProfile(req, res) {
    try {
      const userId = req.user._id;
      const { name, email, licenseNumber, vehicleDetails } = req.body;

      if (req.user.role !== 'driver') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only drivers can update driver profile',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Manual validation for vehicle details since we disabled runValidators
      if (vehicleDetails) {
        if (vehicleDetails.year && (vehicleDetails.year < 1990 || vehicleDetails.year > new Date().getFullYear() + 1)) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Vehicle year must be between 1990 and ' + (new Date().getFullYear() + 1),
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      const updateData = { $set: {} };
      if (name) {
        updateData.$set['profile.name'] = name;
      }
      if (email !== undefined && email !== null) {
        // Only update email if it's a non-empty string
        if (email.trim() === '') {
          updateData.$unset = { email: 1 }; // Remove email field if empty
        } else {
          updateData.$set.email = email.trim();
        }
      }
      if (licenseNumber) {
        updateData.$set['driverInfo.licenseNumber'] = licenseNumber;
      }

      if (vehicleDetails) {
        if (vehicleDetails.make) {
          updateData.$set['driverInfo.vehicleDetails.make'] = vehicleDetails.make;
        }
        if (vehicleDetails.model) {
          updateData.$set['driverInfo.vehicleDetails.model'] = vehicleDetails.model;
        }
        if (vehicleDetails.plateNumber) {
          updateData.$set['driverInfo.vehicleDetails.plateNumber'] = vehicleDetails.plateNumber;
        }
        if (vehicleDetails.color) {
          updateData.$set['driverInfo.vehicleDetails.color'] = vehicleDetails.color;
        }
        if (vehicleDetails.year) {
          updateData.$set['driverInfo.vehicleDetails.year'] = vehicleDetails.year;
        }
      }

      const user = await User.findByIdAndUpdate(
        userId,
        updateData,
        {
          new: true,
          runValidators: false // Disable validators for nested updates due to this.parent() issue
        }
      ).select('-password');

      res.json({
        success: true,
        data: { user },
        message: 'Driver profile updated successfully'
      });
    } catch (error) {
      console.error('Update driver profile error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DRIVER_PROFILE_UPDATE_FAILED',
          message: 'Failed to update driver profile',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Get user statistics
   */
  static async getUserStats(req, res) {
    try {
      const userId = req.user._id;
      const userRole = req.user.role;

      let stats = {};

      if (userRole === 'rider') {
        // Rider statistics
        const totalRides = await Ride.countDocuments({ riderId: userId });
        const completedRides = await Ride.countDocuments({ riderId: userId, status: 'completed' });
        const cancelledRides = await Ride.countDocuments({ riderId: userId, status: 'cancelled' });

        // Calculate average rating given by rider
        const ridesWithRating = await Ride.find({
          riderId: userId,
          status: 'completed',
          'rating.riderRating': { $exists: true }
        }).select('rating.riderRating');

        const totalRatings = ridesWithRating.length;
        const rating = totalRatings > 0
          ? ridesWithRating.reduce((sum, ride) => sum + ride.rating.riderRating, 0) / totalRatings
          : 0;

        stats = {
          totalRides,
          completedRides,
          cancelledRides,
          rating,
          totalRatings
        };
      } else if (userRole === 'driver') {
        // Driver statistics
        const totalRides = await Ride.countDocuments({ driverId: userId });
        const completedRides = await Ride.countDocuments({ driverId: userId, status: 'completed' });
        const cancelledRides = await Ride.countDocuments({ driverId: userId, status: 'cancelled' });

        // Calculate earnings
        const completedRidesData = await Ride.find({
          driverId: userId,
          status: 'completed',
          'fare.final': { $exists: true }
        }).select('fare.final');

        const totalEarnings = completedRidesData.reduce((total, ride) => {
          return total + (ride.fare.final || 0);
        }, 0);

        // Get average rating
        const user = await User.findById(userId);
        const rating = user.profile.rating || 0;
        const totalRatings = user.profile.totalRatings || 0;

        stats = {
          totalRides,
          completedRides,
          cancelledRides,
          rating,
          totalRatings,
          totalEarnings
        };
      } else {
        // Admin or other roles
        stats = {
          totalRides: 0,
          completedRides: 0,
          cancelledRides: 0,
          rating: 0,
          totalRatings: 0
        };
      }

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get user stats error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_FETCH_FAILED',
          message: 'Failed to fetch user statistics',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Change user password
   */
  static async changePassword(req, res) {
    try {
      const userId = req.user._id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Current password and new password are required',
            timestamp: new Date().toISOString()
          }
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Password must be at least 6 characters long',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Get user with password field (explicitly select password since it has select: false)
      const user = await User.findById(userId).select('+password');

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CURRENT_PASSWORD',
            message: 'Current password is incorrect',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Set new password (will be hashed automatically by pre-save hook in User model)
      user.password = newPassword;
      await user.save();

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PASSWORD_CHANGE_FAILED',
          message: 'Failed to change password',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  static async updateLocation(req, res) {
    try {
      const userId = req.user._id;
      const { latitude, longitude, heading, speed } = req.body;

      if (!latitude || !longitude ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_COORDINATES',
            message: 'Valid latitude and longitude are required',
            timestamp: new Date().toISOString()
          }
        });
      }

      if (req.user.role !== 'driver') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only drivers can update location',
            timestamp: new Date().toISOString()
          }
        });
      }

      const updateData = {
        'driverInfo.currentLocation': {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        'driverInfo.lastLocationUpdate': new Date()
      };

      if (heading !== undefined) {
        updateData['driverInfo.heading'] = heading;
      }
      if (speed !== undefined) {
        updateData['driverInfo.speed'] = speed;
      }

      const user = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('Update location error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LOCATION_UPDATE_FAILED',
          message: 'Failed to update driver location',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  static async updateAvailability(req, res) {
    try {
      const userId = req.user._id;
      const { isAvailable } = req.body;

      if (req.user.role !== 'driver') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only drivers can update availability',
            timestamp: new Date().toISOString()
          }
        });
      }

      if (typeof isAvailable !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_AVAILABILITY',
            message: 'Availability must be a boolean value',
            timestamp: new Date().toISOString()
          }
        });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { 'driverInfo.isAvailable': isAvailable },
        { new: true, runValidators: true }
      ).select('-password');

      res.json({
        success: true,
        data: user,
        message: `Driver is now ${isAvailable ? 'available' : 'unavailable'}`
      });
    } catch (error) {
      console.error('Update availability error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'AVAILABILITY_UPDATE_FAILED',
          message: 'Failed to update driver availability',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  static async getDriverStats(req, res) {
    try {
      const userId = req.user._id;

      if (req.user.role !== 'driver') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only drivers can access driver statistics',
            timestamp: new Date().toISOString()
          }
        });
      }

      const user = await User.findById(userId);

      const totalRides = await Ride.countDocuments({
        driverId: userId,
        status: 'completed'
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayRides = await Ride.countDocuments({
        driverId: userId,
        status: 'completed',
        'timeline.completedAt': {
          $gte: today,
          $lt: tomorrow
        }
      });

      const completedRides = await Ride.find({
        driverId: userId,
        status: 'completed',
        'fare.final': { $exists: true }
      }).select('fare.final');

      const earnings = completedRides.reduce((total, ride) => {
        return total + (ride.fare.final || 0);
      }, 0);

      const stats = {
        totalRides,
        rating: user.profile.rating || 0,
        earnings,
        todayRides
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get driver stats error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_FETCH_FAILED',
          message: 'Failed to fetch driver statistics',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  // Admin-specific methods
  static async getAllUsers(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const { page = 1, limit = 10, role, status, search } = req.query;
      const skip = (page - 1) * limit;

      // Build filter query - exclude admin users to prevent accidental suspension
      const filter = { role: { $ne: 'admin' } };
      if (role && ['rider', 'driver'].includes(role)) {
        filter.role = role;
      }
      if (status === 'active') {
        filter.isActive = true;
      }
      if (status === 'inactive') {
        filter.isActive = false;
      }
      if (search) {
        filter.$or = [
          { 'profile.name': { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }

      const users = await User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await User.countDocuments(filter);

      res.json({
        success: true,
        data: users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'USERS_FETCH_FAILED',
          message: 'Failed to fetch users',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  static async getUserById(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const { userId } = req.params;
      const user = await User.findById(userId).select('-password');

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Get user's ride statistics
      const matchCondition = user.role === 'driver'
        ? { driverId: user._id }
        : { riderId: user._id };

      const rideStats = await Ride.aggregate([
        { $match: matchCondition },
        {
          $addFields: {
            fareAmount: { $ifNull: ['$fare.final', '$fare.estimated'] }
          }
        },
        {
          $group: {
            _id: null,
            totalRides: { $sum: 1 },
            completedRides: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            cancelledRides: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
            totalEarnings: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$fareAmount', 0] } }
          }
        }
      ]);

      const stats = rideStats[0] || {
        totalRides: 0,
        completedRides: 0,
        cancelledRides: 0,
        totalEarnings: 0
      };

      // For drivers, calculate 80% of total earnings (driver's cut)
      if (user.role === 'driver' && stats.totalEarnings > 0) {
        stats.totalEarnings = stats.totalEarnings * 0.8;
      }

      res.json({
        success: true,
        data: {
          user,
          stats
        }
      });
    } catch (error) {
      console.error('Get user by ID error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'USER_FETCH_FAILED',
          message: 'Failed to fetch user details',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  static async suspendUser(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const { userId } = req.params;
      const { reason } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Prevent admin from suspending themselves
      if (user._id.toString() === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CANNOT_SUSPEND_SELF',
            message: 'Cannot suspend your own account',
            timestamp: new Date().toISOString()
          }
        });
      }

      user.isActive = false;
      await user.save();

      // Log the suspension action
      console.log(`🚫 User suspended by admin ${req.user._id}: User ${userId} - Reason: ${reason || 'No reason provided'}`);

      res.json({
        success: true,
        message: 'User suspended successfully',
        data: {
          userId,
          isActive: false,
          suspendedBy: req.user._id,
          reason: reason || null,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Suspend user error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'USER_SUSPENSION_FAILED',
          message: 'Failed to suspend user',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  static async reactivateUser(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const { userId } = req.params;
      const { reason } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString()
          }
        });
      }

      user.isActive = true;
      await user.save();

      // Log the reactivation action
      console.log(`✅ User reactivated by admin ${req.user._id}: User ${userId} - Reason: ${reason || 'No reason provided'}`);

      res.json({
        success: true,
        message: 'User reactivated successfully',
        data: {
          userId,
          isActive: true,
          reactivatedBy: req.user._id,
          reason: reason || null,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Reactivate user error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'USER_REACTIVATION_FAILED',
          message: 'Failed to reactivate user',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  static async getPlatformStats(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Get user statistics
      const userStats = await User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
            active: { $sum: { $cond: ['$isActive', 1, 0] } }
          }
        }
      ]);

      // Get ride statistics
      const rideStats = await Ride.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get revenue statistics (platform takes 20% of total fare)
      const revenueStats = await Ride.aggregate([
        { $match: { status: 'completed' } },
        {
          $addFields: {
            fareAmount: { $ifNull: ['$fare.final', '$fare.estimated'] }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: { $multiply: ['$fareAmount', 0.2] } }, // Platform's 20% cut
            totalDriverEarnings: { $sum: { $multiply: ['$fareAmount', 0.8] } }, // Driver's 80% cut
            totalRides: { $sum: 1 },
            averageFare: { $avg: '$fareAmount' }
          }
        }
      ]);

      // Get today's statistics
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayStats = await Ride.aggregate([
        { $match: { createdAt: { $gte: today, $lt: tomorrow } } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get active drivers count
      const activeDrivers = await User.countDocuments({
        role: 'driver',
        isActive: true,
        'driverInfo.isAvailable': true
      });

      // Format response
      const stats = {
        users: {
          total: userStats.reduce((sum, stat) => sum + stat.count, 0),
          riders: userStats.find(s => s._id === 'rider')?.count || 0,
          drivers: userStats.find(s => s._id === 'driver')?.count || 0,
          admins: userStats.find(s => s._id === 'admin')?.count || 0,
          activeUsers: userStats.reduce((sum, stat) => sum + stat.active, 0),
          activeDrivers
        },
        rides: {
          total: rideStats.reduce((sum, stat) => sum + stat.count, 0),
          requested: rideStats.find(s => s._id === 'requested')?.count || 0,
          matched: rideStats.find(s => s._id === 'matched')?.count || 0,
          accepted: rideStats.find(s => s._id === 'accepted')?.count || 0,
          inProgress: rideStats.find(s => s._id === 'in_progress')?.count || 0,
          completed: rideStats.find(s => s._id === 'completed')?.count || 0,
          cancelled: rideStats.find(s => s._id === 'cancelled')?.count || 0
        },
        revenue: revenueStats[0] || { totalRevenue: 0, totalRides: 0, averageFare: 0 },
        today: {
          rides: todayStats.reduce((sum, stat) => sum + stat.count, 0),
          completed: todayStats.find(s => s._id === 'completed')?.count || 0,
          cancelled: todayStats.find(s => s._id === 'cancelled')?.count || 0
        }
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get platform stats error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_FETCH_FAILED',
          message: 'Failed to fetch platform statistics',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  static async getAllRides(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const { page = 1, limit = 10, status, search, startDate, endDate } = req.query;
      const skip = (page - 1) * limit;

      // Build filter query
      const filter = {};
      if (status && ['requested', 'matched', 'accepted', 'in_progress', 'completed', 'cancelled'].includes(status)) {
        filter.status = status;
      }
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) {
          filter.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          filter.createdAt.$lte = new Date(endDate);
        }
      }

      const rides = await Ride.find(filter)
        .populate('riderId', 'profile.name phone role')
        .populate('driverId', 'profile.name phone role driverInfo.vehicleDetails')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Ride.countDocuments(filter);

      res.json({
        success: true,
        data: rides,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get all rides error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RIDES_FETCH_FAILED',
          message: 'Failed to fetch rides',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }
}

module.exports = UserController;