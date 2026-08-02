/**
 * One-off cleanup: delete every account except admin and the two demo
 * accounts (rider/driver from seed.js's demoUsers), plus any rides that
 * reference a deleted account, plus every completed ride (including the
 * demo accounts' own) so the demo dataset always starts ride-history-free.
 * Dry-run by default - pass --apply to write.
 *
 * Usage:
 *   node backend/scripts/cleanup-accounts.js            (dry run, prints what would be removed)
 *   node backend/scripts/cleanup-accounts.js --apply     (actually deletes)
 */

require('dotenv').config();
const dbConnection = require('../config/database');
const { User, Ride } = require('../models');
const encryptionUtils = require('../utils/encryption');
const { demoUsers } = require('./seed');

const APPLY = process.argv.includes('--apply');

async function cleanupAccounts() {
  // phone_hash is derived from the plaintext phone before encryption (see User.js
  // pre-save hook), so we can compute it here without touching the encrypted field.
  const demoPhoneHashes = demoUsers
    .filter(u => u.phone)
    .map(u => encryptionUtils.hashData(u.phone));

  const deleteFilter = {
    role: { $ne: 'admin' },
    phone_hash: { $nin: demoPhoneHashes }
  };

  const toDelete = await User.find(deleteFilter).select('profile.name role phone email');

  if (toDelete.length === 0) {
    console.log('✅ Nothing to clean up - only admin/demo accounts exist.');
    return;
  }

  console.log(`${APPLY ? '🗑️  Deleting' : '🔍 Would delete'} ${toDelete.length} account(s):`);
  toDelete.forEach(u => {
    console.log(`  - ${u.role}: ${u.profile?.name || '(no name)'} (${u.phone || u.email || u._id})`);
  });

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to actually delete.');
    return;
  }

  const ids = toDelete.map(u => u._id);

  const rideResult = await Ride.deleteMany({
    $or: [{ riderId: { $in: ids } }, { driverId: { $in: ids } }]
  });
  console.log(`🗑️  Removed ${rideResult.deletedCount} ride(s) referencing deleted accounts`);

  const userResult = await User.deleteMany({ _id: { $in: ids } });
  console.log(`🗑️  Removed ${userResult.deletedCount} account(s)`);
}

async function cleanupCompletedRides() {
  // Runs regardless of which accounts still exist - includes the demo
  // accounts' own completed rides, not just deleted-account rides.
  const count = await Ride.countDocuments({ status: 'completed' });

  if (count === 0) {
    console.log('✅ No completed rides to clean up.');
    return;
  }

  console.log(`${APPLY ? '🗑️  Deleting' : '🔍 Would delete'} ${count} completed ride(s)`);

  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply to actually delete.');
    return;
  }

  const result = await Ride.deleteMany({ status: 'completed' });
  console.log(`🗑️  Removed ${result.deletedCount} completed ride(s)`);
}

async function run() {
  try {
    await dbConnection.connect();
    await cleanupAccounts();
    await cleanupCompletedRides();
  } catch (error) {
    console.error('❌ Account cleanup failed:', error.message);
    process.exit(1);
  } finally {
    await dbConnection.disconnect();
    process.exit(0);
  }
}

if (require.main === module) {
  run();
}
