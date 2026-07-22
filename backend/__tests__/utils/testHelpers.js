/**
 * Test Helper Utilities
 * Common utilities and helpers for testing
 */

const mongoose = require('mongoose');
const { User, Ride, OTP } = require('../../models');

/**
 * Database utilities
 */
const dbHelpers = {
  /**
   * Clear all collections
   */
  async clearDatabase() {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  },

  /**
   * Create test data in bulk
   */
  async seedTestData(options = {}) {
    const {
      riders = 5,
      drivers = 3,
      rides = 10,
      admins = 1
    } = options;

    const createdData = {
      riders: [],
      drivers: [],
      rides: [],
      admins: []
    };

    // Create riders
    for (let i = 0; i < riders; i++) {
      const rider = await global.testUtils.createTestUser({
        phone: `+155500000${i}`,
        role: 'rider',
        profile: { name: `Test Rider ${i + 1}` }
      });
      createdData.riders.push(rider);
    }

    // Create drivers
    for (let i = 0; i < drivers; i++) {
      const driver = await global.testUtils.createTestDriver({
        phone: `+155511111${i}`,
        role: 'driver',
        profile: { name: `Test Driver ${i + 1}` },
        driverInfo: {
          currentLocation: {
            type: 'Point',
            coordinates: [-74.006 + (i * 0.01), 40.7128 + (i * 0.01)]
          }
        }
      });
      createdData.drivers.push(driver);
    }

    // Create admins
    for (let i = 0; i < admins; i++) {
      const admin = await global.testUtils.createTestUser({
        email: `admin${i}@test.com`,
        role: 'admin',
        profile: { name: `Test Admin ${i + 1}` }
      });
      createdData.admins.push(admin);
    }

    // Create rides
    for (let i = 0; i < rides; i++) {
      const rider = createdData.riders[i % createdData.riders.length];
      const driver = createdData.drivers[i % createdData.drivers.length];

      const ride = await global.testUtils.createTestRide({
        riderId: rider._id,
        driverId: Math.random() > 0.3 ? driver._id : undefined, // 70% have drivers
        status: getRandomRideStatus(),
        pickup: {
          address: `${100 + i} Test Street, New York, NY`,
          coordinates: {
            type: 'Point',
            coordinates: [-74.006 + (i * 0.001), 40.7128 + (i * 0.001)]
          }
        },
        destination: {
          address: `${200 + i} Test Avenue, New York, NY`,
          coordinates: {
            type: 'Point',
            coordinates: [-73.996 + (i * 0.001), 40.7589 + (i * 0.001)]
          }
        }
      });
      createdData.rides.push(ride);
    }

    return createdData;
  }
};

/**
 * Mock data generators
 */
const mockData = {
  /**
   * Generate random coordinates within NYC area
   */
  generateNYCCoordinates() {
    const nycBounds = {
      north: 40.9176,
      south: 40.4774,
      east: -73.7004,
      west: -74.2591
    };

    return {
      type: 'Point',
      coordinates: [
        nycBounds.west + Math.random() * (nycBounds.east - nycBounds.west),
        nycBounds.south + Math.random() * (nycBounds.north - nycBounds.south)
      ]
    };
  },

  /**
   * Generate random phone number
   */
  generatePhoneNumber() {
    const areaCode = Math.floor(Math.random() * 900) + 100;
    const exchange = Math.floor(Math.random() * 900) + 100;
    const number = Math.floor(Math.random() * 9000) + 1000;
    return `+1${areaCode}${exchange}${number}`;
  },

  /**
   * Generate random email
   */
  generateEmail(prefix = 'test') {
    const domains = ['test.com', 'example.com', 'demo.org'];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const timestamp = Date.now();
    return `${prefix}${timestamp}@${domain}`;
  },

  /**
   * Generate random vehicle details
   */
  generateVehicleDetails() {
    const makes = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'Hyundai'];
    const models = ['Camry', 'Accord', 'Fusion', 'Malibu', 'Altima', 'Elantra'];
    const colors = ['White', 'Black', 'Silver', 'Blue', 'Red', 'Gray'];

    return {
      make: makes[Math.floor(Math.random() * makes.length)],
      model: models[Math.floor(Math.random() * models.length)],
      plateNumber: generatePlateNumber(),
      color: colors[Math.floor(Math.random() * colors.length)]
    };
  }
};

/**
 * API testing utilities
 */
const apiHelpers = {
  /**
   * Create authenticated request headers
   */
  createAuthHeaders(token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  },

  /**
   * Extract error code from response
   */
  extractErrorCode(response) {
    return response.body?.error?.code || 'UNKNOWN_ERROR';
  },

  /**
   * Wait for async operations to complete
   */
  async waitFor(condition, timeout = 5000, interval = 100) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }
};

/**
 * Socket.IO testing utilities
 */
const socketHelpers = {
  /**
   * Create mock socket for testing
   */
  createMockSocket(userId, role = 'rider') {
    const events = {};

    return {
      id: `socket_${userId}`,
      userId,
      role,
      rooms: new Set(),

      // Mock socket methods
      emit: jest.fn(),
      on: jest.fn((event, handler) => {
        events[event] = handler;
      }),
      off: jest.fn(),
      join: jest.fn((room) => {
        this.rooms.add(room);
      }),
      leave: jest.fn((room) => {
        this.rooms.delete(room);
      }),
      disconnect: jest.fn(),

      // Test helpers
      trigger: (event, data) => {
        if (events[event]) {
          events[event](data);
        }
      },

      getEvents: () => events
    };
  },

  /**
   * Simulate socket connection
   */
  simulateConnection(socket, userData) {
    socket.userId = userData.userId;
    socket.role = userData.role;
    socket.trigger('connection', userData);
  }
};

/**
 * Time utilities for testing
 */
const timeHelpers = {
  /**
   * Create date in the past
   */
  pastDate(daysAgo = 1) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
  },

  /**
   * Create date in the future
   */
  futureDate(daysFromNow = 1) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date;
  },

  /**
   * Sleep for testing async operations
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

/**
 * Validation helpers
 */
const validationHelpers = {
  /**
   * Check if object has required properties
   */
  hasRequiredProperties(obj, requiredProps) {
    return requiredProps.every(prop => Object.prototype.hasOwnProperty.call(obj, prop));
  },

  /**
   * Validate coordinate format
   */
  isValidCoordinate(coord) {
    return coord &&
           coord.type === 'Point' &&
           Array.isArray(coord.coordinates) &&
           coord.coordinates.length === 2 &&
           typeof coord.coordinates[0] === 'number' &&
           typeof coord.coordinates[1] === 'number' &&
           coord.coordinates[0] >= -180 && coord.coordinates[0] <= 180 &&
           coord.coordinates[1] >= -90 && coord.coordinates[1] <= 90;
  },

  /**
   * Validate phone number format
   */
  isValidPhoneNumber(phone) {
    const phoneRegex = /^\+1\d{10}$/;
    return phoneRegex.test(phone);
  },

  /**
   * Validate email format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
};

// Helper functions
function getRandomRideStatus() {
  const statuses = ['requested', 'matched', 'accepted', 'in_progress', 'completed', 'cancelled'];
  return statuses[Math.floor(Math.random() * statuses.length)];
}

function generatePlateNumber() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';

  let plate = '';
  // 3 letters
  for (let i = 0; i < 3; i++) {
    plate += letters[Math.floor(Math.random() * letters.length)];
  }
  // 3 numbers
  for (let i = 0; i < 3; i++) {
    plate += numbers[Math.floor(Math.random() * numbers.length)];
  }

  return plate;
}

module.exports = {
  dbHelpers,
  mockData,
  apiHelpers,
  socketHelpers,
  timeHelpers,
  validationHelpers
};