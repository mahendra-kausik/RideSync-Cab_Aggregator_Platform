const mongoose = require('mongoose');

/**
 * OTP Model for temporary verification code storage with TTL indexing
 */

const otpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    validate: {
      validator: function (phone) {
        return /^\+?[1-9]\d{1,14}$/.test(phone);
      },
      message: 'Invalid phone number format'
    },
    index: true
  },
  otp: {
    type: String,
    required: true,
    validate: {
      validator: function (otp) {
        return /^\d{6}$/.test(otp);
      },
      message: 'OTP must be 6 digits'
    }
  },
  attempts: {
    type: Number,
    default: 0,
    min: 0,
    max: 3
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    default: Date.now,
    expires: 0, // TTL: MongoDB deletes once the stored expiresAt timestamp is reached
    index: true
  }
}, {
  timestamps: true
});

// Indexes
otpSchema.index({ phone: 1, isUsed: 1 });
otpSchema.index({ phone: 1, createdAt: -1 });

// Static methods
otpSchema.statics.generateOTP = function () {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

otpSchema.statics.createOTP = async function (phone) {
  await this.updateMany({ phone: phone, isUsed: false }, { isUsed: true });
  const otp = this.generateOTP();
  const otpDoc = new this({
    phone: phone,
    otp: otp,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000)
  });
  await otpDoc.save();
  return { otp, expiresAt: otpDoc.expiresAt };
};

const OTP = mongoose.model('OTP', otpSchema);
module.exports = OTP;