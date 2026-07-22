const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * User Model with encrypted PII fields and role-based schema validation
 * Supports riders, drivers, and admin users with appropriate field validation
 */

// Vehicle details sub-schema for drivers
const vehicleSchema = new mongoose.Schema({
  make: {
    type: String,
    required: function () {
      return this.parent().role === 'driver';
    },
    trim: true,
    maxlength: 50
  },
  model: {
    type: String,
    required: function () {
      return this.parent().role === 'driver';
    },
    trim: true,
    maxlength: 50
  },
  plateNumber: {
    type: String,
    required: function () {
      return this.parent().role === 'driver';
    },
    trim: true,
    uppercase: true,
    maxlength: 20
  },
  color: {
    type: String,
    required: function () {
      return this.parent().role === 'driver';
    },
    trim: true,
    maxlength: 30
  },
  year: {
    type: Number,
    min: 1990,
    max: new Date().getFullYear() + 1
  }
}, { _id: false });

// Driver-specific information sub-schema
const driverInfoSchema = new mongoose.Schema({
  licenseNumber: {
    type: String,
    required: function () {
      return this.parent().role === 'driver';
    },
    trim: true,
    maxlength: 50
  },
  vehicleDetails: {
    type: vehicleSchema,
    required: function () {
      return this.parent().role === 'driver';
    }
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      validate: {
        validator: function (coords) {
          return coords.length === 2 &&
            coords[0] >= -180 && coords[0] <= 180 && // longitude
            coords[1] >= -90 && coords[1] <= 90;     // latitude
        },
        message: 'Invalid coordinates format. Expected [longitude, latitude]'
      }
    }
  },
  lastLocationUpdate: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Main user schema
const userSchema = new mongoose.Schema({
  // Authentication fields
  phone: {
    type: String,
    required: function () {
      return this.role !== 'admin';
    },
    sparse: true, // Allows null values to be non-unique
    validate: {
      validator: function (phone) {
        if (!phone && this.role === 'admin') {
          return true;
        }
        return /^\+?[1-9]\d{1,14}$/.test(phone); // E.164 format
      },
      message: 'Invalid phone number format'
    }
  },
  // Hashed phone for querying (SHA-256 hash, not encrypted)
  phone_hash: {
    type: String,
    unique: true,
    sparse: true,
    select: false // Don't include in queries by default
  },
  email: {
    type: String,
    required: function () {
      return this.role === 'admin';
    },
    sparse: true,
    lowercase: true,
    validate: {
      validator: function (email) {
        if (!email && this.role !== 'admin') {
          return true;
        }
        // Allow .local domains for development
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Invalid email format'
    }
  },
  // Hashed email for querying
  email_hash: {
    type: String,
    unique: true,
    sparse: true,
    select: false
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false // Don't include in queries by default
  },

  // Role and permissions
  role: {
    type: String,
    enum: ['rider', 'driver', 'admin'],
    required: true,
    default: 'rider'
  },

  // Profile information (PII - will be encrypted)
  profile: {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100
    },
    avatar: {
      type: String,
      default: null
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    totalRides: {
      type: Number,
      min: 0,
      default: 0
    },
    totalRatings: {
      type: Number,
      min: 0,
      default: 0
    }
  },

  // Driver-specific information
  driverInfo: {
    type: driverInfoSchema,
    required: function () {
      return this.role === 'driver';
    }
  },

  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },

  // Audit fields
  lastLogin: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      // Decrypt PII fields for JSON response
      const encryptionUtils = require('../utils/encryption');
      if (encryptionUtils.isAvailable()) {
        const PII_FIELDS = [
          'phone',
          'email',
          'profile.name',
          'driverInfo.licenseNumber',
          'driverInfo.vehicleDetails.plateNumber'
        ];

        PII_FIELDS.forEach(field => {
          const value = encryptionUtils.getNestedValue(ret, field);
          if (value && typeof value === 'string') {
            try {
              const decrypted = encryptionUtils.decrypt(value);
              encryptionUtils.setNestedValue(ret, field, decrypted);
            } catch (error) {
              // If decryption fails, keep original value (might already be decrypted)
            }
          }
        });
      }

      delete ret.password;
      delete ret.phone_hash;
      delete ret.email_hash;
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Indexes for performance
userSchema.index({ phone_hash: 1 }, { unique: true, sparse: true });
userSchema.index({ email_hash: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1 });
userSchema.index({ 'driverInfo.currentLocation': '2dsphere' }); // Geospatial index
userSchema.index({ 'driverInfo.isAvailable': 1, role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for average rating calculation
userSchema.virtual('profile.averageRating').get(function () {
  if (this.profile.totalRatings === 0) {
    return 0;
  }
  return Math.round((this.profile.rating / this.profile.totalRatings) * 10) / 10;
});

// Pre-save middleware for password hashing
userSchema.pre('save', async function (next) {
  // Only hash password if it's modified
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Hash password with bcrypt (minimum 10 salt rounds as per requirements)
    const saltRounds = 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware for updating timestamps
userSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Instance method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Instance method to update driver location
userSchema.methods.updateLocation = function (longitude, latitude) {
  if (this.role !== 'driver') {
    throw new Error('Only drivers can update location');
  }

  this.driverInfo.currentLocation = {
    type: 'Point',
    coordinates: [longitude, latitude]
  };
  this.driverInfo.lastLocationUpdate = new Date();

  return this.save();
};

// Instance method to toggle driver availability
userSchema.methods.toggleAvailability = function () {
  if (this.role !== 'driver') {
    throw new Error('Only drivers can toggle availability');
  }

  this.driverInfo.isAvailable = !this.driverInfo.isAvailable;
  return this.save();
};

// Instance method to update rating
userSchema.methods.updateRating = function (newRating) {
  if (newRating < 1 || newRating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }

  this.profile.totalRatings += 1;
  this.profile.rating += newRating;

  return this.save();
};

// Static method to find available drivers near location
userSchema.statics.findAvailableDriversNear = function (longitude, latitude, maxDistance = 5000) {
  return this.find({
    role: 'driver',
    isActive: true,
    'driverInfo.isAvailable': true,
    'driverInfo.currentLocation': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance // meters
      }
    }
  }).select('profile driverInfo createdAt');
};

// Static method to find by phone (queries using hash)
userSchema.statics.findByPhone = function (phone) {
  const phoneHash = encryptionUtils.hashData(phone);
  return this.findOne({ phone_hash: phoneHash });
};

// Static method to find by email (queries using hash)
userSchema.statics.findByEmail = function (email) {
  const emailHash = encryptionUtils.hashData(email);
  return this.findOne({ email_hash: emailHash });
};

// Static method to create driver with validation
userSchema.statics.createDriver = function (driverData) {
  const driver = new this({
    ...driverData,
    role: 'driver'
  });

  return driver.save();
};

// Static method to create admin user
userSchema.statics.createAdmin = function (adminData) {
  const admin = new this({
    ...adminData,
    role: 'admin'
  });

  return admin.save();
};

// Enhanced PII encryption using secure encryption utility
const encryptionUtils = require('../utils/encryption');

// Define PII fields that need encryption
const PII_FIELDS = [
  'phone',
  'email',
  'profile.name',
  'driverInfo.licenseNumber',
  'driverInfo.vehicleDetails.plateNumber'
];

// Pre-save middleware for encrypting PII fields
userSchema.pre('save', function (next) {
  // Generate hashes for queryable fields BEFORE encryption (hash plaintext values)
  if (this.isModified('phone') && this.phone) {
    this.phone_hash = encryptionUtils.hashData(this.phone);
  }
  if (this.isModified('email') && this.email) {
    this.email_hash = encryptionUtils.hashData(this.email);
  }

  if (encryptionUtils.isAvailable()) {
    // Encrypt modified PII fields AFTER hashing
    PII_FIELDS.forEach(field => {
      if (this.isModified(field)) {
        const value = encryptionUtils.getNestedValue(this, field);
        if (value && typeof value === 'string') {
          encryptionUtils.setNestedValue(this, field, encryptionUtils.encrypt(value));
        }
      }
    });
  }

  next();
});

// Post-find middleware for decrypting PII fields (for display)
userSchema.post(['find', 'findOne', 'findOneAndUpdate'], function (docs) {
  if (!encryptionUtils.isAvailable()) {
    return;
  }

  const decrypt = (doc) => {
    if (!doc) {
      return;
    }

    // Decrypt PII fields directly on the document
    PII_FIELDS.forEach(field => {
      const value = encryptionUtils.getNestedValue(doc, field);
      if (value && typeof value === 'string') {
        try {
          const decrypted = encryptionUtils.decrypt(value);
          encryptionUtils.setNestedValue(doc, field, decrypted);
        } catch (error) {
          // If decryption fails, keep original value
        }
      }
    });
  };

  if (Array.isArray(docs)) {
    docs.forEach(decrypt);
  } else {
    decrypt(docs);
  }
});

// Post-init middleware to decrypt fields when document is loaded (including populated docs)
userSchema.post('init', function (doc) {
  if (!encryptionUtils.isAvailable() || !doc) {
    return;
  }

  // Decrypt PII fields
  PII_FIELDS.forEach(field => {
    const value = encryptionUtils.getNestedValue(doc, field);
    if (value && typeof value === 'string') {
      try {
        const decrypted = encryptionUtils.decrypt(value);
        encryptionUtils.setNestedValue(doc, field, decrypted);
      } catch (error) {
        // If decryption fails, keep original value
      }
    }
  });
});

const User = mongoose.model('User', userSchema);

module.exports = User;