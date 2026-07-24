/**
 * One-time migration: the demo rider/driver phone numbers moved from E.164
 * ('+1234567890') to plain 10-digit ('1234567890') to match the new phone
 * validation rule. Existing accounts are found by their OLD phone's hash
 * (phone_hash is computed from the raw value, so the lookup still works
 * even though the app-level regex now rejects that old format) and their
 * phone is re-set via the User document's own .set() so the pre-save hook
 * recomputes phone_hash and re-encrypts correctly.
 */

require('dotenv').config();
const dbConnection = require('../config/database');
const { User } = require('../models');

const PHONE_MIGRATIONS = [
  { oldPhone: '+1234567890', newPhone: '1234567890' },
  { oldPhone: '+1234567892', newPhone: '1234567892' }
];

async function migrateDemoPhones() {
  for (const { oldPhone, newPhone } of PHONE_MIGRATIONS) {
    const user = await User.findByPhone(oldPhone);
    if (!user) {
      console.log(`⏭️  Skipping ${oldPhone} — not found (already migrated or fresh DB)`);
      continue;
    }

    user.set('phone', newPhone);
    await user.save();
    console.log(`✅ Migrated ${user.role} phone: ${oldPhone} -> ${newPhone}`);
  }
}

async function run() {
  try {
    await dbConnection.connect();
    await migrateDemoPhones();
  } catch (error) {
    console.error('❌ Phone migration failed:', error.message);
    process.exit(1);
  } finally {
    await dbConnection.disconnect();
    process.exit(0);
  }
}

if (require.main === module) {
  run();
}
