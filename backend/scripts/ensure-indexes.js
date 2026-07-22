// One-shot: build/sync indexes declared in the Mongoose schemas against Atlas.
// Needed because production disables mongoose's implicit autoIndex-on-connect
// (blocking index builds on a live M0 cluster are a footgun); this script is
// the explicit replacement, run manually after deploy or via a CI step.
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://cabadmin:SecureDevPassword2024@mongodb:27017/cab_aggregator?authSource=admin';

const User = require('../models/User');
const Ride = require('../models/Ride');
const OTP = require('../models/OTP');

async function ensureIndexes() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    for (const Model of [User, Ride, OTP]) {
        console.log(`🔧 Syncing indexes for ${Model.modelName}...`);
        const result = await Model.syncIndexes();
        console.log(`   → ${result.length ? result.join(', ') : '(no changes)'}`);
    }

    console.log('✅ All indexes synced');
    await mongoose.connection.close();
    process.exit(0);
}

ensureIndexes().catch(async (error) => {
    console.error('❌ Error syncing indexes:', error);
    await mongoose.connection.close();
    process.exit(1);
});
