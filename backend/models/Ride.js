const mongoose = require('mongoose');

/**
 * Ride Model with geospatial indexing and status workflow validation
 */

// Location sub-schema
const locationSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  coordinates: {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator: function (coords) {
          return coords.length === 2 &&
            coords[0] >= -180 && coords[0] <= 180 &&
            coords[1] >= -90 && coords[1] <= 90;
        },
        message: 'Invalid coordinates format'
      }
    }
  }
}, { _id: false });

// Fare breakdown sub-schema
const fareSchema = new mongoose.Schema({
  estimated: {
    type: Number,
    required: true,
    min: 0
  },
  final: {
    type: Number,
    min: 0,
    default: null
  },
  breakdown: {
    baseFare: { type: Number, required: true, min: 0 },
    distanceFare: { type: Number, required: true, min: 0 },
    timeFare: { type: Number, required: true, min: 0 },
    surgeFare: { type: Number, default: 0, min: 0 }
  }
}, { _id: false });

// Timeline sub-schema
const timelineSchema = new mongoose.Schema({
  requestedAt: { type: Date, required: true, default: Date.now },
  matchedAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null }
}, { _id: false });

// Payment sub-schema
const paymentSchema = new mongoose.Schema({
  method: {
    type: String,
    enum: ['cash', 'card', 'wallet', 'mock'],
    default: 'mock'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  transactionId: { type: String, default: null },
  processedAt: { type: Date, default: null }
}, { _id: false });

// Rating sub-schema
const ratingSchema = new mongoose.Schema({
  riderRating: { type: Number, min: 1, max: 5, default: null },
  driverRating: { type: Number, min: 1, max: 5, default: null },
  riderFeedback: { type: String, maxlength: 500, default: null },
  driverFeedback: { type: String, maxlength: 500, default: null }
}, { _id: false });

// Main ride schema
const rideSchema = new mongoose.Schema({
  riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  status: {
    type: String,
    enum: ['requested', 'matched', 'accepted', 'in_progress', 'completed', 'cancelled'],
    required: true,
    default: 'requested',
    index: true
  },
  pickup: { type: locationSchema, required: true },
  destination: { type: locationSchema, required: true },
  estimatedDistance: { type: Number, required: true, min: 0 },
  actualDistance: { type: Number, min: 0, default: null },
  estimatedDuration: { type: Number, required: true, min: 0 },
  actualDuration: { type: Number, min: 0, default: null },
  fare: { type: fareSchema, required: true },
  timeline: { type: timelineSchema, required: true, default: () => ({}) },
  payment: { type: paymentSchema, required: true, default: () => ({}) },
  rating: { type: ratingSchema, default: () => ({}) },
  cancellationReason: { type: String, maxlength: 200, default: null },
  specialInstructions: { type: String, maxlength: 300, default: null },
  // Sequential offer flow: while status is 'matched', driverId holds the driver
  // currently being offered the ride and offerExpiresAt is when that offer lapses.
  // rejectedBy accumulates drivers who declined or timed out, so re-matching skips them.
  offerExpiresAt: { type: Date, default: null, index: true },
  rejectedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance and geospatial queries
rideSchema.index({ riderId: 1, createdAt: -1 });
rideSchema.index({ driverId: 1, createdAt: -1 });
rideSchema.index({ status: 1, createdAt: -1 });
rideSchema.index({ 'pickup.coordinates': '2dsphere' });
rideSchema.index({ 'destination.coordinates': '2dsphere' });

// Status workflow validation
const statusTransitions = {
  'requested': ['matched', 'cancelled'],
  'matched': ['accepted', 'requested', 'cancelled'],
  'accepted': ['in_progress', 'cancelled'],
  'in_progress': ['completed', 'cancelled'],
  'completed': [],
  'cancelled': []
};

// Pre-save middleware for status workflow validation
rideSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    const now = new Date();
    switch (this.status) {
      case 'matched': this.timeline.matchedAt = now; break;
      case 'accepted': this.timeline.acceptedAt = now; break;
      case 'in_progress': this.timeline.startedAt = now; break;
      case 'completed': this.timeline.completedAt = now; break;
      case 'cancelled': this.timeline.cancelledAt = now; break;
    }
  }
  next();
});

// Instance method to update status with validation
rideSchema.methods.updateStatus = function (newStatus, reason = null) {
  const allowedTransitions = statusTransitions[this.status] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(`Cannot transition from ${this.status} to ${newStatus}`);
  }
  this.status = newStatus;
  if (reason && newStatus === 'cancelled') {
    this.cancellationReason = reason;
  }
  return this.save();
};

const Ride = mongoose.model('Ride', rideSchema);
module.exports = Ride;