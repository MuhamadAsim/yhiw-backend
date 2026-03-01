// models/jobModel.js
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
  // IDs
  jobNumber: {
    type: String,
    unique: true,
    required: true
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false  // Important: false because it's assigned later
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Job Details
  title: {
    type: String,
    required: true
  },
  serviceType: {
    type: String,
    required: true,
    enum: [
      'Towing',
      'Roadside Assistance',
      'Fuel Delivery',
      'Battery Replacement',
      'AC Gas Refill',
      'Tire Replacement',
      'Oil Change',
      'Inspection / Repair',
      'Car Wash',
      'Car Detailing',
      'Car Rental',
      'Spare Parts'
    ]
  },
  description: {
    type: String,
    maxLength: 500
  },

  // Pricing
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

  // Locations
  pickupLocation: {
    type: locationSchema,
    required: true
  },
  dropoffLocation: {
    type: locationSchema
  },

  // Status and Timeline
  status: {
    type: String,
    enum: [
      'pending',      // Customer requested, waiting for provider acceptance
      'accepted',      // Provider accepted
      'en-route',      // Provider on the way to pickup
      'arrived',       // Provider arrived at pickup
      'in-progress',   // Service in progress
      'completed',     // Job completed successfully
      'cancelled',     // Job cancelled
      'expired',       // Job expired (no provider found within 5 mins)
      'no-show'        // Customer didn't show up
    ],
    default: 'pending'
  },

  // Timestamps for each stage
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
  expiredAt: Date,  // When job expired (no provider found)

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

  // TTL index field - this is what auto-deletes documents
  expireAt: {
    type: Date,
    default: null
  }

}, {
  timestamps: true
});

// ============== FIXED PRE-SAVE HOOK ==============
// Use function declaration without arrow function to preserve 'this' context
jobSchema.pre('save', async function(next) {
  try {
    console.log('📝 Running pre-save hook for job:', this.jobNumber);
    
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
    
    // IMPORTANT: Call next() to proceed
    next();
  } catch (error) {
    console.error('❌ Error in pre-save hook:', error);
    // Pass error to next to trigger error handling
    next(error);
  }
});

// ============== INDEXES ==============
// Create indexes after schema definition
jobSchema.index({ jobNumber: 1 }, { unique: true });
jobSchema.index({ providerId: 1, createdAt: -1 });
jobSchema.index({ customerId: 1, createdAt: -1 });
jobSchema.index({ status: 1 });
jobSchema.index({ completedAt: 1 });
jobSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
jobSchema.index({ 'pickupLocation.latitude': 1, 'pickupLocation.longitude': 1 });

// ============== STATIC METHODS ==============
// Static method to manually cleanup expired jobs (as backup)
jobSchema.statics.cleanupExpiredJobs = async function() {
  try {
    const result = await this.deleteMany({
      status: 'pending',
      requestedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } // Older than 5 minutes
    });
    console.log(`🧹 Cleaned up ${result.deletedCount} expired pending jobs`);
    return result;
  } catch (error) {
    console.error('❌ Error cleaning up expired jobs:', error);
    throw error;
  }
};

// ============== INSTANCE METHODS ==============
// Method to check if job is expired
jobSchema.methods.isExpired = function() {
  return this.status === 'pending' && 
         this.expireAt && 
         new Date() > this.expireAt;
};

// Method to expire the job manually
jobSchema.methods.expire = async function() {
  this.status = 'expired';
  this.expiredAt = new Date();
  this.expireAt = null;
  return this.save();
};

// Method to accept job
jobSchema.methods.accept = async function(providerId) {
  this.providerId = providerId;
  this.status = 'accepted';
  this.acceptedAt = new Date();
  this.expireAt = null; // Remove expiration
  return this.save();
};

// Method to cancel job
jobSchema.methods.cancel = async function(cancelledBy, reason) {
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancelledBy = cancelledBy;
  this.cancellationReason = reason;
  this.expireAt = null; // Remove expiration
  return this.save();
};

// Create the model
const Job = mongoose.model('Job', jobSchema);

export default Job;