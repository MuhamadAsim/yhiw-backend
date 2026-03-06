// models/Job.js
import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
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
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Snapshot of essential booking data
  bookingData: {
    serviceId: String,
    serviceName: String,
    servicePrice: Number,
    serviceCategory: String,

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

    vehicle: {
      type: {
        type: String,     
      }, makeModel: String,
      year: String,
      color: String,
      licensePlate: String
    },

    customer: {
      name: String,
      phone: String,
      email: String
    },

    urgency: String,
    issues: [String],
    description: String,

    payment: {
      totalAmount: Number,
      selectedTip: Number,
      baseServiceFee: Number
    },

    // Service-specific flags
    isCarRental: Boolean,
    isFuelDelivery: Boolean,
    isSpareParts: Boolean,
    fuelType: String,
    partDescription: String,
    hasInsurance: Boolean
  },

  // Job status - ONLY these 4 values
  status: {
    type: String,
    enum: ['accepted', 'in_progress', 'completed', 'cancelled','completed_confirmed'],
    default: 'accepted'
  },

  // Timeline
  acceptedAt: { type: Date, default: Date.now },
  startedAt: Date,        // When service started (status becomes 'in_progress')
  completedAt: Date,      // When service completed
  cancelledAt: Date,
  cancelledBy: {
    type: String,
    enum: ['customer', 'provider', 'system']
  },

  // NEW: Time tracking for service
  timeTracking: {
    totalSeconds: { type: Number, default: 0 },
    pausedAt: Date,
    isPaused: { type: Boolean, default: false },
    timeExtensions: [{
      minutes: Number,
      reason: String,
      requestedAt: Date,
      approved: { type: Boolean, default: false }
    }]
  },

  // NEW: Photos documentation
  photos: [{
    type: {
      type: String,
      enum: ['pre-service', 'during-service', 'post-service', 'issue'],
      default: 'during-service'
    },
    url: String,
    description: String,
    uploadedAt: { type: Date, default: Date.now }
  }],

  // NEW: Issues reported during service
  issues: [{
    type: String,
    description: String,
    severity: { type: String, enum: ['low', 'medium', 'high'] },
    reportedAt: Date,
    status: { type: String, enum: ['open', 'resolved'], default: 'open' }
  }],

  // NEW: Service completion details
  completionDetails: {
    notes: String,
    checklistCompleted: [String],
    issuesFound: [String],
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },

  // Live tracking
  currentLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
    lastUpdated: Date
  },

  // Ratings
  customerRating: {
    rating: Number,
    review: String,
    createdAt: Date
  },
  providerRating: {
    rating: Number,
    review: String,
    createdAt: Date
  }

}, { timestamps: true });

// Indexes
jobSchema.index({ customerId: 1, createdAt: -1 });
jobSchema.index({ providerId: 1, status: 1 });
jobSchema.index({ bookingId: 1 });
jobSchema.index({ status: 1, createdAt: -1 });

const Job = mongoose.model('Job', jobSchema);
export default Job;