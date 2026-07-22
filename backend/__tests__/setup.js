const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
process.env.ENCRYPTION_KEY = 'test-encryption-key-exactly-32bb'; // Exactly 32 chars
process.env.DISABLE_MATCHING = 'true'; // Disable background matching in tests

let mongoServer;

// Use a real MongoDB (e.g. the CI-provided service container) when MONGO_URI is set;
// otherwise fall back to an in-memory server for local dev without Docker.
beforeAll(async () => {
  const mongoUri = process.env.MONGO_URI;

  if (mongoUri) {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  } else {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  }
});

// Clean up database between tests
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }

  // Wait a bit for any pending async operations
  await new Promise(resolve => setTimeout(resolve, 100));
});

// Close database connection after all tests
afterAll(async () => {
  // Wait for any pending operations
  await new Promise(resolve => setTimeout(resolve, 500));

  // Clear all timers
  jest.clearAllTimers();

  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }

  if (mongoServer) {
    await mongoServer.stop();
  }
});// Global test utilities
global.testUtils = {
  createTestUser: async (userData = {}) => {
    const { User } = require('../models');
    const AuthUtils = require('../utils/auth');

    const defaultUser = {
      phone: '+1234567890',
      password: await AuthUtils.hashPassword('testpassword123'),
      role: 'rider',
      profile: { name: 'Test User' },
      isVerified: true,
      isActive: true,
      ...userData
    };

    return await User.create(defaultUser);
  },

  createTestDriver: async (driverData = {}) => {
    const { User } = require('../models');
    const AuthUtils = require('../utils/auth');

    const defaultDriver = {
      phone: '+1987654321',
      password: await AuthUtils.hashPassword('driverpass123'),
      role: 'driver',
      profile: { name: 'Test Driver' },
      driverInfo: {
        licenseNumber: 'DL123456789',
        vehicleDetails: {
          make: 'Toyota',
          model: 'Camry',
          plateNumber: 'ABC123',
          color: 'Blue'
        },
        isAvailable: true,
        currentLocation: {
          type: 'Point',
          coordinates: [-74.006, 40.7128] // NYC coordinates
        }
      },
      isVerified: true,
      isActive: true,
      ...driverData
    };

    return await User.create(defaultDriver);
  },

  createTestRide: async (rideData = {}) => {
    const { Ride } = require('../models');

    const defaultRide = {
      riderId: new mongoose.Types.ObjectId(),
      status: 'requested',
      pickup: {
        address: '123 Test St, New York, NY',
        coordinates: {
          type: 'Point',
          coordinates: [-74.006, 40.7128]
        }
      },
      destination: {
        address: '456 Test Ave, New York, NY',
        coordinates: {
          type: 'Point',
          coordinates: [-73.996, 40.7589]
        }
      },
      fare: {
        estimated: 15.50
      },
      timeline: {
        requestedAt: new Date()
      },
      ...rideData
    };

    return await Ride.create(defaultRide);
  },

  generateAuthToken: (user) => {
    const AuthUtils = require('../utils/auth');
    return AuthUtils.generateAccessToken({
      userId: user._id,
      phone: user.phone,
      email: user.email,
      role: user.role
    });
  }
};