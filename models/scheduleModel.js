import mongoose from 'mongoose';

const scheduledBookingSchema = new mongoose.Schema({
  // Link to user
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Booking reference
  bookingId: {
    type: String,
    unique: true,
    index: true
  },

  // Service Info
  serviceId: { type: String, required: true },
  serviceName: { type: String, required: true },
  serviceCategory: { type: String, required: true },
  basePrice: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  tip: { type: Number, default: 0 },

  // Schedule
  serviceTime: { type: String, default: 'schedule_later' },
  scheduledDate: { type: Date, required: true },
  scheduledTimeSlot: { type: String, required: true }, // e.g. "10:00 AM"

  // Booking Status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled', 'expired'],
    default: 'pending'
  },

  // Location
  pickup: {
    address: String,
    lat: Number,
    lng: Number,
  },
  dropoff: {
    address: String,
    lat: Number,
    lng: Number,
  },
  waypoints: [{
    address: String,
    lat: Number,
    lng: Number,
    order: Number,
  }],
  locationSkipped: { type: Boolean, default: false },

  // Vehicle
  vehicle: {
    type: { type: String },
    makeModel: String,
    year: String,
    color: String,
    licensePlate: String,
  },

  // Contact
  contact: {
    fullName: String,
    phoneNumber: String,
    email: String,
    emergencyContact: String,
  },

  // Additional Details
  urgency: { type: String, default: 'moderate' },
  issues: [String],
  description: String,
  hasInsurance: { type: Boolean, default: false },
  needSpecificTruck: { type: Boolean, default: false },
  hasModifications: { type: Boolean, default: false },
  needMultilingual: { type: Boolean, default: false },

  // Service-Specific
  fuelType: String,
  partDescription: String,
  licenseFront: String,  // base64 or URL
  licenseBack: String,

  // Payment
  paymentMethod: { type: String, default: 'cash' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },

  // Assigned provider (set later when triggered)
  assignedProviderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Trigger tracking - when system processes it
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    default: null  // filled when job is created at trigger time
  },

  // Cancellation
  cancelledAt: Date,
  cancelledBy: { type: String, enum: ['customer', 'provider', 'system'] },
  cancellationReason: String,

}, { timestamps: true });

// Indexes for trigger queries (cron job will query these)
scheduledBookingSchema.index({ scheduledDate: 1, status: 1 });
scheduledBookingSchema.index({ userId: 1, status: 1 });

const ScheduledBooking = mongoose.model('ScheduledBooking', scheduledBookingSchema);
export default ScheduledBooking;