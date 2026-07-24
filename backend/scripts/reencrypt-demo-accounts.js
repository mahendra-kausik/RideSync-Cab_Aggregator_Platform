/**
 * One-time maintenance: force re-encryption of the 3 demo accounts' PII fields.
 * They were originally seeded before ENCRYPTION_KEY was fully wired up for this
 * environment, so fields like profile.name were stored as plaintext -- the
 * User model's decrypt hooks then fail (safely, falling back to the stored
 * value) on every read, producing harmless but noisy "Decryption failed" logs.
 * Re-saving with each PII field explicitly marked modified forces the
 * pre-save hook to actually encrypt them this run.
 */

require('dotenv').config();
const dbConnection = require('../config/database');
const { User } = require('../models');
const { demoUsers } = require('./seed');

const PII_FIELDS = [
  'phone',
  'email',
  'profile.name',
  'driverInfo.licenseNumber',
  'driverInfo.vehicleDetails.plateNumber'
];

async function reencryptDemoAccounts() {
  for (const userData of demoUsers) {
    const user = userData.email
      ? await User.findByEmail(userData.email)
      : await User.findByPhone(userData.phone);

    if (!user) {
      console.log(`⏭️  Skipping ${userData.email || userData.phone} — not found`);
      continue;
    }

    PII_FIELDS.forEach((field) => user.markModified(field));
    await user.save();
    console.log(`✅ Re-encrypted demo ${user.role}: ${userData.email || userData.phone}`);
  }
}

async function run() {
  try {
    await dbConnection.connect();
    await reencryptDemoAccounts();
  } catch (error) {
    console.error('❌ Re-encryption failed:', error.message);
    process.exit(1);
  } finally {
    await dbConnection.disconnect();
    process.exit(0);
  }
}

if (require.main === module) {
  run();
}
