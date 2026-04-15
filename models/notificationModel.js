// models/JobNotification.js (NEW FILE - don't replace the old one)
import mongoose from 'mongoose';

const jobNotificationSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Basic service info
  serviceId: String,
  serviceName: String,
  servicePrice: Number,
  serviceCategory: String,

  // Location data
  pickup: {
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  dropoff: {
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  // Vehicle data
  vehicle: {
    vehicleType: String,
    makeModel: String,
    year: String,
    color: String,
    licensePlate: String
  },

  // Customer contact
  customer: {
    name: String,
    phone: String
  },

  // Urgency
  urgency: String,

  // Issues/description
  issues: [String],
  description: String,

  // Payment info
  payment: {
    totalAmount: Number,
    selectedTip: Number,
    baseServiceFee: Number
  },

  // Service-specific flags
  isCarRental: { type: Boolean, default: false },
  isFuelDelivery: { type: Boolean, default: false },
  isSpareParts: { type: Boolean, default: false },

  // Fuel specific
  fuelType: String,

  // Spare parts specific
  partDescription: String,

  // Rental specific
  hasInsurance: Boolean,

  // Status
  status: {
    type: String,
    enum: ['scheduled', 'pending', 'accepted', 'expired'],
    default: 'pending'
  },

  // Schedule fields
  isScheduled: { type: Boolean, default: false },
  serviceTime: { type: String, default: 'schedule_later' },

  scheduledAt: { type: Date },
  activeServiceNotificationSent: {
    type: Boolean,
    default: false
  },

  // Who viewed this job
  viewedBy: [{
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date, default: Date.now }
  }],

  createdAt: { type: Date, default: Date.now },

  // TTL field - NO AUTO DELETION
  expiresAt: { type: Date }

}, { timestamps: true, collection: 'jobnotifications' }); // ← DIFFERENT COLLECTION NAME

// Regular indexes (NO TTL INDEX)
jobNotificationSchema.index({ 'pickup.coordinates': '2dsphere' });
jobNotificationSchema.index({ serviceName: 1, createdAt: -1 });
jobNotificationSchema.index({ status: 1 });
jobNotificationSchema.index({ isScheduled: 1, scheduledAt: 1 });

const Notification = mongoose.model('JobNotification', jobNotificationSchema);
export default Notification;