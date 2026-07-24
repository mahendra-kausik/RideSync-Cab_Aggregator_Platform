/**
 * Idempotent demo-account seeding: exactly one admin, one rider, one driver.
 * Safe to run on every server startup (see server.js) or manually via `npm run seed`.
 * Never touches existing data — only creates an account if its phone/email isn't already present.
 */

require('dotenv').config();
const dbConnection = require('../config/database');
const { User } = require('../models');

const demoUsers = [
  {
    email: 'admin@cabaggreg.local',
    password: 'admin123',
    role: 'admin',
    profile: {
      name: 'System Administrator'
    },
    isVerified: true
  },
  {
    phone: '1234567890',
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
    phone: '1234567892',
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
        coordinates: [77.5946, 12.9716] // Bengaluru, India
      }
    },
    isVerified: true
  }
];

async function ensureDemoAccounts() {
  for (const userData of demoUsers) {
    const existing = userData.email
      ? await User.findByEmail(userData.email)
      : await User.findByPhone(userData.phone);

    if (existing) {
      continue;
    }

    const user = new User(userData);
    try {
      await user.save();
      console.log(`✅ Seeded demo ${user.role}: ${userData.profile.name} (${userData.email || userData.phone})`);
    } catch (error) {
      // Another instance's concurrent boot won the race and inserted this account first
      // (the find-then-save check above isn't atomic across processes) — end state is
      // still "account exists", so this isn't a real failure.
      if (error.code !== 11000) {
throw error;
}
    }
  }
}

async function seedDatabase() {
  try {
    console.log('🌱 Ensuring demo accounts exist...');
    await dbConnection.connect();
    await ensureDemoAccounts();

    console.log('\n🔐 Demo Credentials:');
    console.log('Admin: admin@cabaggreg.local / admin123');
    console.log('Rider: 1234567890 / rider123');
    console.log('Driver: 1234567892 / driver123');
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

module.exports = { ensureDemoAccounts, demoUsers };
