const AuthUtils = require('../utils/auth');
const { User, Ride } = require('../models');

/**
 * Socket.IO Service for Real-time Communication
 * Handles driver location updates, ride status changes, and room management
 * Requirements: 3.3, 4.1, 4.2
 */

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId mapping
    this.userSockets = new Map(); // socketId -> user data mapping
  }

  /**
   * Initialize Socket.IO handlers
   * @param {Server} io - Socket.IO server instance
   */
  initializeSocketHandlers(io) {
    this.io = io;

    // Authentication middleware for Socket.IO
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = AuthUtils.verifyToken(token);

        // Fetch user from database
        const user = await User.findById(decoded.userId).select('-password');

        if (!user || !user.isActive) {
          return next(new Error('Invalid user or account suspended'));
        }

        // Attach user data to socket
        socket.userId = user._id.toString();
        socket.userRole = user.role;
        socket.userData = user;

        next();
      } catch (error) {
        console.error('Socket authentication error:', error.message);
        next(new Error('Authentication failed'));
      }
    });

    // Handle new connections
    io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    console.log('✅ Socket.IO handlers initialized');
  }

  /**
   * Handle new socket connection
   */
  handleConnection(socket) {
    const userId = socket.userId;
    const userRole = socket.userRole;

    console.log(`🔌 User connected: ${userId} (${userRole}) - Socket: ${socket.id}`);

    // Store user connection mapping
    this.connectedUsers.set(userId, socket.id);
    this.userSockets.set(socket.id, {
      userId,
      userRole,
      userData: socket.userData
    });

    // Send connection confirmation
    socket.emit('connection:confirmed', {
      message: 'Connected successfully',
      userId,
      role: userRole,
      timestamp: new Date().toISOString()
    });

    // Handle ride room joining
    socket.on('ride:join-room', (data) => {
      this.handleJoinRideRoom(socket, data);
    });

    // Handle ride room leaving
    socket.on('ride:leave-room', (data) => {
      this.handleLeaveRideRoom(socket, data);
    });

    // Handle driver location updates
    socket.on('driver:location-update', (data) => {
      this.handleDriverLocationUpdate(socket, data);
    });

    // Handle ride status updates
    socket.on('ride:status-update', (data) => {
      this.handleRideStatusUpdate(socket, data);
    });

    // Handle driver availability updates
    socket.on('driver:availability-update', (data) => {
      this.handleDriverAvailabilityUpdate(socket, data);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    // Handle reconnection
    socket.on('reconnect', () => {
      this.handleReconnection(socket);
    });
  }

  /**
   * Handle joining a ride room
   */
  async handleJoinRideRoom(socket, data) {
    try {
      const { rideId } = data;
      const userId = socket.userId;
      const userRole = socket.userRole;

      if (!rideId) {
        socket.emit('error', { message: 'Ride ID is required' });
        return;
      }

      // Verify user has access to this ride
      const ride = await Ride.findById(rideId);
      if (!ride) {
        socket.emit('error', { message: 'Ride not found' });
        return;
      }

      // Check if user is authorized for this ride
      const isAuthorized =
        ride.riderId.toString() === userId ||
        ride.driverId?.toString() === userId ||
        userRole === 'admin';

      if (!isAuthorized) {
        socket.emit('error', { message: 'Unauthorized access to ride' });
        return;
      }

      // Join the ride room
      const roomName = `ride:${rideId}`;
      socket.join(roomName);

      console.log(`👥 User ${userId} (${userRole}) joined ride room: ${rideId}`);

      // Notify user of successful room join
      socket.emit('ride:room-joined', {
        rideId,
        roomName,
        message: 'Successfully joined ride room',
        timestamp: new Date().toISOString()
      });

      // Notify other participants in the room
      socket.to(roomName).emit('ride:participant-joined', {
        userId,
        userRole,
        rideId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error joining ride room:', error);
      socket.emit('error', { message: 'Failed to join ride room' });
    }
  }

  /**
   * Handle leaving a ride room
   */
  async handleLeaveRideRoom(socket, data) {
    try {
      const { rideId } = data;
      const userId = socket.userId;
      const userRole = socket.userRole;

      if (!rideId) {
        socket.emit('error', { message: 'Ride ID is required' });
        return;
      }

      const roomName = `ride:${rideId}`;
      socket.leave(roomName);

      console.log(`👋 User ${userId} (${userRole}) left ride room: ${rideId}`);

      // Notify user of successful room leave
      socket.emit('ride:room-left', {
        rideId,
        roomName,
        message: 'Successfully left ride room',
        timestamp: new Date().toISOString()
      });

      // Notify other participants in the room
      socket.to(roomName).emit('ride:participant-left', {
        userId,
        userRole,
        rideId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error leaving ride room:', error);
      socket.emit('error', { message: 'Failed to leave ride room' });
    }
  }

  /**
   * Handle driver location updates
   */
  async handleDriverLocationUpdate(socket, data) {
    try {
      const { rideId, location, heading, speed } = data;
      const userId = socket.userId;
      const userRole = socket.userRole;

      // Only drivers can send location updates
      if (userRole !== 'driver') {
        socket.emit('error', { message: 'Only drivers can send location updates' });
        return;
      }

      if (!rideId || !location || !location.latitude || !location.longitude) {
        socket.emit('error', { message: 'Ride ID and valid location coordinates are required' });
        return;
      }

      // Verify driver is assigned to this ride
      const ride = await Ride.findById(rideId);
      if (!ride || ride.driverId?.toString() !== userId) {
        socket.emit('error', { message: 'Driver not assigned to this ride' });
        return;
      }

      // Update driver location in database
      await User.findByIdAndUpdate(userId, {
        'driverInfo.currentLocation': {
          type: 'Point',
          coordinates: [location.longitude, location.latitude]
        }
      });

      const roomName = `ride:${rideId}`;
      console.log(`📍 Driver ${userId} location updated for ride ${rideId}`);

      // Broadcast location update to ride participants
      const locationUpdate = {
        rideId,
        driverId: userId,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          heading: heading || null,
          speed: speed || null
        },
        timestamp: new Date().toISOString()
      };

      socket.to(roomName).emit('driver:location-updated', locationUpdate);

    } catch (error) {
      console.error('Error handling driver location update:', error);
      socket.emit('error', { message: 'Failed to update driver location' });
    }
  }

  /**
   * Handle ride status updates
   */
  async handleRideStatusUpdate(socket, data) {
    try {
      const { rideId, status, location } = data;
      const userId = socket.userId;
      const userRole = socket.userRole;

      if (!rideId || !status) {
        socket.emit('error', { message: 'Ride ID and status are required' });
        return;
      }

      // Verify user has permission to update this ride
      const ride = await Ride.findById(rideId);
      if (!ride) {
        socket.emit('error', { message: 'Ride not found' });
        return;
      }

      const canUpdate =
        ride.riderId.toString() === userId ||
        ride.driverId?.toString() === userId ||
        userRole === 'admin';

      if (!canUpdate) {
        socket.emit('error', { message: 'Unauthorized to update this ride' });
        return;
      }

      // Update ride status in database
      const updateData = { status };
      if (location) {
        updateData.currentLocation = {
          type: 'Point',
          coordinates: [location.longitude, location.latitude]
        };
      }

      await Ride.findByIdAndUpdate(rideId, updateData);

      const roomName = `ride:${rideId}`;
      console.log(`🔄 Ride ${rideId} status updated to ${status} by ${userId}`);

      // Broadcast status update to all ride participants
      const statusUpdate = {
        rideId,
        status,
        updatedBy: userId,
        userRole,
        location: location || null,
        timestamp: new Date().toISOString()
      };

      this.io.to(roomName).emit('ride:status-updated', statusUpdate);

    } catch (error) {
      console.error('Error handling ride status update:', error);
      socket.emit('error', { message: 'Failed to update ride status' });
    }
  }

  /**
   * Handle driver availability updates
   */
  async handleDriverAvailabilityUpdate(socket, data) {
    try {
      const { isAvailable, location } = data;
      const userId = socket.userId;
      const userRole = socket.userRole;

      // Only drivers can update availability
      if (userRole !== 'driver') {
        socket.emit('error', { message: 'Only drivers can update availability' });
        return;
      }

      if (typeof isAvailable !== 'boolean') {
        socket.emit('error', { message: 'Valid availability status is required' });
        return;
      }

      // Update driver availability in database
      const updateData = { 'driverInfo.isAvailable': isAvailable };

      if (location && location.latitude && location.longitude) {
        updateData['driverInfo.currentLocation'] = {
          type: 'Point',
          coordinates: [location.longitude, location.latitude]
        };
      }

      await User.findByIdAndUpdate(userId, updateData);

      console.log(`🚗 Driver ${userId} availability updated to ${isAvailable ? 'available' : 'unavailable'}`);

      const availabilityData = {
        driverId: userId,
        isAvailable,
        location: location || null,
        timestamp: new Date().toISOString()
      };

      // Confirm availability update to driver
      socket.emit('driver:availability-updated', availabilityData);

      // Emit driver status change to all admins
      for (const socketId of this.connectedUsers.values()) {
        const socketInfo = this.userSockets.get(socketId);
        if (socketInfo && socketInfo.userRole === 'admin') {
          this.io.to(socketId).emit('driver:status-change', availabilityData);
        }
      }

    } catch (error) {
      console.error('Error handling driver availability update:', error);
      socket.emit('error', { message: 'Failed to update driver availability' });
    }
  }

  /**
   * Handle socket disconnection
   */
  handleDisconnection(socket, reason) {
    const userId = socket.userId;
    const userRole = socket.userRole;

    console.log(`🔌 User disconnected: ${userId} (${userRole}) - Reason: ${reason}`);

    // Only clean up if this socket is still the user's current one — a stale
    // disconnect event (e.g. delayed after a fast reconnect) must not wipe a live mapping
    const isCurrentSocket = this.connectedUsers.get(userId) === socket.id;
    this.userSockets.delete(socket.id);

    if (!isCurrentSocket) {
      return;
    }
    this.connectedUsers.delete(userId);

    // If driver disconnects, update availability to false
    if (userRole === 'driver') {
      User.findByIdAndUpdate(userId, { 'driverInfo.isAvailable': false })
        .catch(error => console.error('Error updating driver availability on disconnect:', error));
    }
  }

  /**
   * Handle socket reconnection
   */
  handleReconnection(socket) {
    const userId = socket.userId;
    const userRole = socket.userRole;

    console.log(`🔄 User reconnected: ${userId} (${userRole}) - Socket: ${socket.id}`);

    // Update connection mappings
    this.connectedUsers.set(userId, socket.id);
    this.userSockets.set(socket.id, {
      userId,
      userRole,
      userData: socket.userData
    });

    // Send reconnection confirmation
    socket.emit('connection:reconnected', {
      message: 'Reconnected successfully',
      userId,
      role: userRole,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast message to specific user
   */
  broadcastToUser(userId, event, data) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId && this.io) {
      this.io.to(socketId).emit(event, data);
      return true;
    }
    return false;
  }

  /**
   * Broadcast message to ride room and all admins
   */
  broadcastToRide(rideId, event, data) {
    if (this.io) {
      // Emit to ride room participants
      this.io.to(`ride:${rideId}`).emit(event, data);

      // Also emit to all connected admin users for dashboard monitoring
      for (const socketId of this.connectedUsers.values()) {
        const socketInfo = this.userSockets.get(socketId);
        if (socketInfo && socketInfo.userRole === 'admin') {
          this.io.to(socketId).emit(event, data);
        }
      }

      return true;
    }
    return false;
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  /**
   * Get user socket info
   */
  getUserSocketInfo(userId) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      return this.userSockets.get(socketId);
    }
    return null;
  }
}

// Create singleton instance
const socketService = new SocketService();

module.exports = socketService;