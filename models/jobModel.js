// models/jobModel.js - Alternative version
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
  }
}, { _id: false });

const jobSchema = new mongoose.Schema({
  // ... all your schema fields (same as above) ...
  jobNumber: {
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
  title: {
    type: String,
    required: true
  },
  serviceType: {
    type: String,
    required: true,
    enum: [
      'Towing', 'Roadside Assistance', 'Fuel Delivery', 'Battery Replacement',
      'AC Gas Refill', 'Tire Replacement', 'Oil Change', 'Inspection / Repair',
      'Car Wash', 'Car Detailing', 'Car Rental', 'Spare Parts'
    ]
  },
  description: {
    type: String,
    maxLength: 500
  },
  price: {
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
  },
  pickupLocation: {
    type: locationSchema,
    required: true
  },
  dropoffLocation: {
    type: locationSchema
  },
  status: {
    type: String,
    enum: [
      'pending', 'accepted', 'en-route', 'arrived', 'in-progress',
      'completed', 'cancelled', 'expired', 'no-show'
    ],
    default: 'pending'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: Date,
  enRouteAt: Date,
  arrivedAt: Date,
  startedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  cancelledBy: {
    type: String,
    enum: ['customer', 'provider']
  },
  cancellationReason: String,
  expiredAt: Date,
  estimatedDuration: {
    type: Number,
    default: 30
  },
  actualDuration: {
    type: Number,
    default: 0
  },
  distance: {
    type: Number,
    default: 0
  },
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
  providerNotes: {
    type: String,
    maxLength: 500
  },
  isDisputed: {
    type: Boolean,
    default: false
  },
  disputeReason: String,
  disputeResolvedAt: Date,
  disputeResolution: String,
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  expireAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// ============== FIX: Use regular function with explicit this binding ==============
// This is the most reliable approach for ES modules
jobSchema.pre('save', function(next) {
  // Use regular function, not arrow function
  // 'this' refers to the document being saved
  
  console.log('📝 Running pre-save hook for job:', this.jobNumber);
  
  try {
    // If this is a new pending job, set expireAt to 5 minutes from now
    if (this.isNew && this.status === 'pending') {
      const fiveMinutesFromNow = new Date();
      fiveMinutesFromNow.setMinutes(fiveMinutesFromNow.getMinutes() + 5);
      this.expireAt = fiveMinutesFromNow;
      console.log(`⏰ Job ${this.jobNumber} will expire at:`, fiveMinutesFromNow);
    }
    
    // If job status changes from pending to something else, remove expiration
    if (!this.isNew && this.isModified('status') && this.status !== 'pending') {
      this.expireAt = null;
      console.log(`⏰ Expiration removed for job ${this.jobNumber} as status changed to ${this.status}`);
    }
    
    next();
  } catch (error) {
    console.error('❌ Error in pre-save hook:', error);
    next(error);
  }
});

// Create indexes
jobSchema.index({ jobNumber: 1 }, { unique: true });
jobSchema.index({ providerId: 1, createdAt: -1 });
jobSchema.index({ customerId: 1, createdAt: -1 });
jobSchema.index({ status: 1 });
jobSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const Job = mongoose.model('Job', jobSchema);

export default Job;