// models/Notification.js
import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
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
  
  // Location data (essential for provider)
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
    type: String,
    makeModel: String,
    year: String,
    color: String,
    licensePlate: String
  },
  
  // Customer contact (minimal)
  customer: {
    name: String,
    phone: String
  },
  
  // Urgency (immediate service)
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
    enum: ['pending', 'accepted', 'expired'],
    default: 'pending'
  },
  
  // Who viewed this job
  viewedBy: [{
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date, default: Date.now }
  }],
  
  createdAt: { type: Date, default: Date.now, expires: 120 } // Auto-delete after 120s

}, { timestamps: true });

// Indexes for provider queries
notificationSchema.index({ 'pickup.coordinates': '2dsphere' });
notificationSchema.index({ serviceName: 1, createdAt: -1 });
notificationSchema.index({ status: 1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;