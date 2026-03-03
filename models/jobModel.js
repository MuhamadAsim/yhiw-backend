import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  // Add coordinates for geospatial queries
  coordinates: {
    type: [Number], // [longitude, latitude]
    index: '2dsphere'
  }
}, { _id: false });

// Vehicle details schema (from frontend)
const vehicleDetailsSchema = new mongoose.Schema({
  type: String,
  makeModel: String,
  year: String,
  color: String,
  licensePlate: String
}, { _id: false });

// Customer details schema (from frontend)
const customerDetailsSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  emergencyContact: String
}, { _id: false });

// Service-specific details
const carRentalDetailsSchema = new mongoose.Schema({
  licenseFront: String,
  licenseBack: String,
  hasInsurance: Boolean
}, { _id: false });

const fuelDeliveryDetailsSchema = new mongoose.Schema({
  fuelType: {
    type: String,
    enum: ['petrol', 'diesel', 'premium']
  }
}, { _id: false });

const sparePartsDetailsSchema = new mongoose.Schema({
  partDescription: String
}, { _id: false });

// Additional details schema
const additionalDetailsSchema = new mongoose.Schema({
  urgency: {
    type: String,
    enum: ['emergency', 'urgent', 'normal']
  },
  issues: [String],
  description: String,
  photos: [String],
  needSpecificTruck: Boolean,
  hasModifications: Boolean,
  needMultilingual: Boolean
}, { _id: false });

// Payment details schema
const paymentDetailsSchema = new mongoose.Schema({
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  selectedTip: {
    type: Number,
    default: 0
  },
  baseServiceFee: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'wallet'],
    default: 'cash'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  }
}, { _id: false });

// Schedule details schema
const scheduleDetailsSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['right_now', 'schedule_later'],
    default: 'right_now'
  },
  scheduledDateTime: {
    date: String,
    timeSlot: String
  }
}, { _id: false });

// Provider details (when assigned)
const providerDetailsSchema = new mongoose.Schema({
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  name: String,
  phone: String,
  rating: Number,
  profileImage: String,
  vehicleDetails: String,
  acceptedAt: Date,
  estimatedArrival: String
}, { _id: false });

const jobSchema = new mongoose.Schema({
  // IDs
  jobNumber: {
    type: String,
    unique: true,
    required: true
  },
  bookingId: {  // Add bookingId for frontend compatibility
    type: String,
    unique: true,
    required: true
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Provider details object (for quick access)
  provider: providerDetailsSchema,

  // Service Information (from frontend)
  serviceId: {
    type: String,
    required: true
  },
  serviceName: {
    type: String,
    required: true
  },
  servicePrice: {
    type: Number,
    required: true,
    min: 0
  },
  serviceCategory: String,
  serviceTime: {
    type: String,
    enum: ['right_now', 'schedule_later'],
    default: 'right_now'
  },

  // Service type flags
  isCarRental: {
    type: Boolean,
    default: false
  },
  isFuelDelivery: {
    type: Boolean,
    default: false
  },
  isSpareParts: {
    type: Boolean,
    default: false
  },

  // Locations
  pickup: {
    type: locationSchema,
    required: true
  },
  dropoff: locationSchema,

  // Vehicle information
  vehicle: vehicleDetailsSchema,

  // Customer information
  customer: customerDetailsSchema,

  // Service-specific details
  carRental: carRentalDetailsSchema,
  fuelDelivery: fuelDeliveryDetailsSchema,
  spareParts: sparePartsDetailsSchema,

  // Additional details
  additionalDetails: additionalDetailsSchema,

  // Schedule
  schedule: scheduleDetailsSchema,

  // Payment
  payment: paymentDetailsSchema,

  // Additional flags
  locationSkipped: {
    type: Boolean,
    default: false
  },

  // Selected tip (for backward compatibility)
  selectedTip: {
    type: Number,
    default: 0
  },

  // Status and Timeline (matching frontend expectations)
  status: {
    type: String,
    enum: [
      'pending',      // Customer requested, waiting for provider
      'searching',     // Searching for providers (frontend uses this)
      'found',         // Provider found (frontend uses this)
      'accepted',      // Provider accepted
      'confirmed',     // Job confirmed (frontend listens for this)
      'provider_assigned', // Provider assigned (frontend listens for this)
      'en-route',      // Provider on the way to pickup
      'arrived',       // Provider arrived at pickup
      'in-progress',   // Service in progress
      'completed',     // Job completed successfully
      'cancelled',     // Job cancelled
      'expired',       // Job expired (no provider found)
      'no_providers'   // No providers available (frontend uses this)
    ],
    default: 'pending'
  },

  // Timestamps for each stage
  requestedAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: Date,
  confirmedAt: Date,
  enRouteAt: Date,
  arrivedAt: Date,
  startedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  cancelledBy: {
    type: String,
    enum: ['customer', 'provider', 'system']
  },
  cancellationReason: String,
  expiredAt: Date,

  // Duration tracking
  estimatedDuration: {
    type: Number, // in minutes
    default: 30
  },
  actualDuration: {
    type: Number, // in minutes
    default: 0
  },

  // Distance tracking
  distance: {
    type: Number, // in km
    default: 0
  },
  estimatedDistance: Number,

  // Customer feedback
  customerRating: {
    type: Number,
    min: 0,
    max: 5
  },
  customerReview: {
    type: String,
    maxLength: 500
  },
  reviewSubmittedAt: Date,

  // Provider notes
  providerNotes: {
    type: String,
    maxLength: 500
  },

  // For dispute handling
  isDisputed: {
    type: Boolean,
    default: false
  },
  disputeReason: String,
  disputeResolvedAt: Date,
  disputeResolution: String,

  // Metadata field for additional data
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // TTL index field
  expireAt: {
    type: Date,
    default: null,
    index: { expires: 0 }
  }

}, {
  timestamps: true
});

// Pre-save middleware to generate bookingId
jobSchema.pre('save', function(next) {
  if (!this.bookingId) {
    this.bookingId = `BK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  if (!this.jobNumber) {
    this.jobNumber = `JOB-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }
  next();
});

// Indexes for better query performance
jobSchema.index({ providerId: 1, createdAt: -1 });
jobSchema.index({ customerId: 1, createdAt: -1 });
jobSchema.index({ status: 1 });
jobSchema.index({ bookingId: 1 }, { unique: true });
jobSchema.index({ jobNumber: 1 }, { unique: true });
jobSchema.index({ completedAt: 1 });
jobSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
jobSchema.index({ 'pickup.coordinates': '2dsphere' });
jobSchema.index({ serviceId: 1 });
jobSchema.index({ urgency: 1 });

const Job = mongoose.model('Job', jobSchema);
export default Job;