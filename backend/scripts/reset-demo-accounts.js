/**
 * One-time cleanup: the demo rider/driver credentials changed (new phone
 * format, new names, new passwords). Rather than patching individual fields
 * on the old documents in place, delete the old demo rider/driver by their
 * previous phone numbers and let seed.js's ensureDemoAccounts() insert fresh
 * ones matching the current demoUsers definition. Admin is untouched.
 */

require('dotenv').config();
const dbConnection = require('../config/database');
const { User } = require('../models');
const { ensureDemoAccounts } = require('./seed');

const OLD_DEMO_PHONES = ['+1234567890', '+1234567892'];

async function resetDemoAccounts() {
  for (const oldPhone of OLD_DEMO_PHONES) {
    const user = await User.findByPhone(oldPhone);
    if (!user) {
      console.log(`⏭️  Skipping ${oldPhone} — not found`);
      continue;
    }
    await User.deleteOne({ _id: user._id });
    console.log(`🗑️  Removed old demo ${user.role} (${oldPhone})`);
  }

  await ensureDemoAccounts();
}

async function run() {
  try {
    await dbConnection.connect();
    await resetDemoAccounts();
  } catch (error) {
    console.error('❌ Demo account reset failed:', error.message);
    process.exit(1);
  } finally {
    await dbConnection.disconnect();
    process.exit(0);
  }
}

if (require.main === module) {
  run();
}
