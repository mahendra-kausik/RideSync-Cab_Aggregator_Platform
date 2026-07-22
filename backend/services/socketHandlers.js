/**
 * Socket.IO Event Handlers
 * Contains utility functions for Socket.IO event handling
 * This file provides helper functions that can be used by the main SocketService
 * Requirements: 3.3, 4.1, 4.2
 */

/**
 * Utility function to validate ride access
 * @param {string} userId - User ID
 * @param {string} userRole - User role
 * @param {Object} ride - Ride document
 * @returns {boolean} - Whether user has access
 */
function validateRideAccess(userId, userRole, ride) {
  if (!ride) {
    return false;
  }

  return (
    ride.riderId.toString() === userId ||
    ride.driverId?.toString() === userId ||
    userRole === 'admin'
  );
}

/**
 * Utility function to validate location data
 * @param {Object} location - Location object
 * @returns {boolean} - Whether location is valid
 */
function validateLocation(location) {
  return (
    location &&
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number' &&
    location.latitude >= -90 && location.latitude <= 90 &&
    location.longitude >= -180 && location.longitude <= 180
  );
}

/**
 * Utility function to create room name
 * @param {string} rideId - Ride ID
 * @returns {string} - Room name
 */
function createRoomName(rideId) {
  return `ride:${rideId}`;
}

/**
 * Utility function to format timestamp
 * @returns {string} - ISO timestamp
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Utility function to log socket events
 * @param {string} event - Event name
 * @param {string} userId - User ID
 * @param {string} userRole - User role
 * @param {string} details - Additional details
 */
function logSocketEvent(event, userId, userRole, details = '') {
  const timestamp = getTimestamp();
  console.log(`[${timestamp}] 🔌 ${event}: User ${userId} (${userRole}) ${details}`);
}

/**
 * Utility function to emit error to socket
 * @param {Socket} socket - Socket instance
 * @param {string} message - Error message
 * @param {string} code - Error code (optional)
 */
function emitError(socket, message, code = 'SOCKET_ERROR') {
  socket.emit('error', {
    success: false,
    error: {
      code,
      message,
      timestamp: getTimestamp()
    }
  });
}

/**
 * Utility function to broadcast ride notification
 * @param {SocketIO} io - Socket.IO instance
 * @param {string} rideId - Ride ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function broadcastRideNotification(io, rideId, event, data) {
  const roomName = createRoomName(rideId);
  const payload = {
    ...data,
    timestamp: getTimestamp()
  };

  io.to(roomName).emit(event, payload);
  logSocketEvent('BROADCAST', 'SYSTEM', 'SYSTEM', `${event} to room ${roomName}`);
}

/**
 * Utility function to handle driver location broadcast
 * @param {Socket} socket - Socket instance
 * @param {string} rideId - Ride ID
 * @param {string} driverId - Driver ID
 * @param {Object} location - Location data
 * @param {number} heading - Heading (optional)
 * @param {number} speed - Speed (optional)
 */
function broadcastDriverLocation(socket, rideId, driverId, location, heading = null, speed = null) {
  const roomName = createRoomName(rideId);
  const locationUpdate = {
    rideId,
    driverId,
    location: {
      latitude: location.latitude,
      longitude: location.longitude,
      heading,
      speed
    },
    timestamp: getTimestamp()
  };

  socket.to(roomName).emit('driver:location-updated', locationUpdate);
  logSocketEvent('LOCATION_UPDATE', driverId, 'driver', `for ride ${rideId}`);
}

/**
 * Utility function to handle ride status broadcast
 * @param {SocketIO} io - Socket.IO instance
 * @param {string} rideId - Ride ID
 * @param {string} status - New status
 * @param {string} updatedBy - User who updated
 * @param {string} userRole - Role of updater
 * @param {Object} location - Location (optional)
 */
function broadcastRideStatus(io, rideId, status, updatedBy, userRole, location = null) {
  const statusUpdate = {
    rideId,
    status,
    updatedBy,
    userRole,
    location,
    timestamp: getTimestamp()
  };

  broadcastRideNotification(io, rideId, 'ride:status-updated', statusUpdate);
}

/**
 * Utility function to handle room join notifications
 * @param {Socket} socket - Socket instance
 * @param {string} rideId - Ride ID
 * @param {string} userId - User ID
 * @param {string} userRole - User role
 */
function notifyRoomJoin(socket, rideId, userId, userRole) {
  const roomName = createRoomName(rideId);

  // Notify user of successful join
  socket.emit('ride:room-joined', {
    rideId,
    roomName,
    message: 'Successfully joined ride room',
    timestamp: getTimestamp()
  });

  // Notify other participants
  socket.to(roomName).emit('ride:participant-joined', {
    userId,
    userRole,
    rideId,
    timestamp: getTimestamp()
  });

  logSocketEvent('ROOM_JOIN', userId, userRole, `joined room ${roomName}`);
}

/**
 * Utility function to handle room leave notifications
 * @param {Socket} socket - Socket instance
 * @param {string} rideId - Ride ID
 * @param {string} userId - User ID
 * @param {string} userRole - User role
 */
function notifyRoomLeave(socket, rideId, userId, userRole) {
  const roomName = createRoomName(rideId);

  // Notify user of successful leave
  socket.emit('ride:room-left', {
    rideId,
    roomName,
    message: 'Successfully left ride room',
    timestamp: getTimestamp()
  });

  // Notify other participants
  socket.to(roomName).emit('ride:participant-left', {
    userId,
    userRole,
    rideId,
    timestamp: getTimestamp()
  });

  logSocketEvent('ROOM_LEAVE', userId, userRole, `left room ${roomName}`);
}

/**
 * Utility function to handle connection confirmation
 * @param {Socket} socket - Socket instance
 * @param {string} userId - User ID
 * @param {string} userRole - User role
 */
function confirmConnection(socket, userId, userRole) {
  socket.emit('connection:confirmed', {
    message: 'Connected successfully',
    userId,
    role: userRole,
    timestamp: getTimestamp()
  });

  logSocketEvent('CONNECT', userId, userRole, `Socket: ${socket.id}`);
}

/**
 * Utility function to handle reconnection confirmation
 * @param {Socket} socket - Socket instance
 * @param {string} userId - User ID
 * @param {string} userRole - User role
 */
function confirmReconnection(socket, userId, userRole) {
  socket.emit('connection:reconnected', {
    message: 'Reconnected successfully',
    userId,
    role: userRole,
    timestamp: getTimestamp()
  });

  logSocketEvent('RECONNECT', userId, userRole, `Socket: ${socket.id}`);
}

/**
 * Utility function to handle driver availability confirmation
 * @param {Socket} socket - Socket instance
 * @param {boolean} isAvailable - Availability status
 * @param {Object} location - Location (optional)
 */
function confirmAvailabilityUpdate(socket, isAvailable, location = null) {
  socket.emit('driver:availability-updated', {
    isAvailable,
    location,
    timestamp: getTimestamp()
  });
}

module.exports = {
  validateRideAccess,
  validateLocation,
  createRoomName,
  getTimestamp,
  logSocketEvent,
  emitError,
  broadcastRideNotification,
  broadcastDriverLocation,
  broadcastRideStatus,
  notifyRoomJoin,
  notifyRoomLeave,
  confirmConnection,
  confirmReconnection,
  confirmAvailabilityUpdate
};