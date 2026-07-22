/**
 * Database seed script for test users (riders, drivers, admin)
 * Run with: npm run seed
 */

require('dotenv').config();
const dbConnection = require('../config/database');
const { User, Ride } = require('../models');

// Test user data
const seedUsers = [
  // Admin user
  {
    email: 'admin@cabaggreg.local',
    password: 'admin123',
    role: 'admin',
    profile: {
      name: 'System Administrator'
    },
    isVerified: true
  },

  // Test riders
  {
    phone: '+1234567890',
    password: 'rider123',
    role: 'rider',
    profile: {
      name: 'John Doe',
      rating: 4.5,
      totalRides: 25,
      totalRatings: 25
    },
    isVerified: true
  },
  {
    phone: '+1234567891',
    password: 'rider123',
    role: 'rider',
    profile: {
      name: 'Jane Smith',
      rating: 4.8,
      totalRides: 15,
      totalRatings: 15
    },
    isVerified: true
  },

  // Test drivers
  {
    phone: '+1234567892',
    password: 'driver123',
    role: 'driver',
    profile: {
      name: 'Mike Johnson',
      rating: 4.7,
      totalRides: 150,
      totalRatings: 150
    },
    driverInfo: {
      licenseNumber: 'DL123456789',
      vehicleDetails: {
        make: 'Toyota',
        model: 'Camry',
        plateNumber: 'ABC123',
        color: 'Silver',
        year: 2020
      },
      isAvailable: true,
      currentLocation: {
        type: 'Point',
        coordinates: [77.5946, 12.9716] // Bengaluru, India coordinates
      }
    },
    isVerified: true
  },
  {
    phone: '+1234567893',
    password: 'driver123',
    role: 'driver',
    profile: {
      name: 'Sarah Wilson',
      rating: 4.9,
      totalRides: 200,
      totalRatings: 200
    },
    driverInfo: {
      licenseNumber: 'DL987654321',
      vehicleDetails: {
        make: 'Honda',
        model: 'Civic',
        plateNumber: 'XYZ789',
        color: 'Blue',
        year: 2021
      },
      isAvailable: true,
      currentLocation: {
        type: 'Point',
        coordinates: [77.6099, 12.9698] // Bengaluru, India coordinates (slightly different location)
      }
    },
    isVerified: true
  }
];

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');

    // Connect to database
    await dbConnection.connect();

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await User.deleteMany({});
    await Ride.deleteMany({});

    // Create users
    console.log('👥 Creating test users...');
    const createdUsers = [];

    for (const userData of seedUsers) {
      try {
        // Store plaintext values before encryption
        const displayName = userData.profile.name;
        const displayIdentifier = userData.phone || userData.email;

        const user = new User(userData);
        await user.save();
        createdUsers.push(user);

        // Log using plaintext values we stored before encryption
        console.log(`✅ Created ${user.role}: ${displayName} (${displayIdentifier})`);
      } catch (error) {
        console.error(`❌ Failed to create user ${userData.profile.name}:`, error.message);
      }
    }

    console.log('\n🎉 Database seeding completed!');
    console.log(`📊 Created ${createdUsers.length} users:`);
    console.log(`   - ${createdUsers.filter(u => u.role === 'admin').length} admin(s)`);
    console.log(`   - ${createdUsers.filter(u => u.role === 'rider').length} rider(s)`);
    console.log(`   - ${createdUsers.filter(u => u.role === 'driver').length} driver(s)`);

    console.log('\n🔐 Test Credentials:');
    console.log('Admin: admin@cabaggreg.local / admin123');
    console.log('Rider: +1234567890 / rider123');
    console.log('Driver: +1234567892 / driver123');

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    await dbConnection.disconnect();
    process.exit(0);
  }
}

// Run seeding if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase, seedUsers };