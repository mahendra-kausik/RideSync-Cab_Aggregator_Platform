const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection - use the same connection string as the backend
const MONGODB_URI = process.env.MONGO_URI || 'mongodb://cabadmin:SecureDevPassword2024@mongodb:27017/cab_aggregator?authSource=admin';

// Import the actual User model with encryption support
const User = require('../models/User');

async function resetPassword(phone, newPassword) {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        console.log(`🔍 Finding user with phone: ${phone}`);
        const user = await User.findByPhone(phone);

        if (!user) {
            console.log('❌ User not found');
            process.exit(1);
        }

        console.log(`✅ Found user: ${user.profile.name}`);
        console.log('💾 Updating password in database...');

        // Assign plaintext and .save() so the model's pre('save') hook hashes it
        // (same path as the changePassword endpoint) instead of duplicating bcrypt here.
        user.password = newPassword;
        await user.save();

        console.log('✅ Password reset successfully!');
        console.log('📝 You can now login with:');
        console.log(`   Phone: ${phone}`);
        console.log(`   Password: ${newPassword}`);

        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        await mongoose.connection.close();
        process.exit(1);
    }
}

// Get command line arguments
const phone = process.argv[2];
const newPassword = process.argv[3];

if (!phone || !newPassword) {
    console.log('Usage: node reset-password.js <phone> <newPassword>');
    console.log('Example: node reset-password.js +1111111111 kausik123');
    process.exit(1);
}

resetPassword(phone, newPassword);
