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
    required: false
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
  disputeResolution: String

}, {
  timestamps: true
});

// models/jobModel.js - Replace your pre-save hook with this

// Generate unique job number before saving
jobSchema.pre('save', function(next) {
  // Use regular function, not arrow, to have access to 'this'
  console.log('🔄 Pre-save hook triggered');
  
  // Only generate if jobNumber doesn't exist
  if (!this.jobNumber) {
    try {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      this.jobNumber = `JOB-${year}${month}${day}-${random}`;
      console.log('✅ Generated job number:', this.jobNumber);
    } catch (error) {
      console.error('❌ Error generating job number:', error);
      return next(error); // Make sure to return here
    }
  }
  
  // IMPORTANT: Make sure next is called exactly once
  console.log('✅ Pre-save hook complete, calling next()');
  return next(); // Add return to be safe
});

// Add error handler for post-save
jobSchema.post('save', function(error, doc, next) {
  if (error) {
    console.error('❌ Post-save error:', error);
    next(error);
  } else {
    next();
  }
});

// Indexes for better query performance
jobSchema.index({ providerId: 1, createdAt: -1 });
jobSchema.index({ customerId: 1, createdAt: -1 });
jobSchema.index({ status: 1 });
jobSchema.index({ jobNumber: 1 }, { unique: true });
jobSchema.index({ completedAt: 1 });
jobSchema.index({ 'pickupLocation.coordinates': '2dsphere' });

const Job = mongoose.model('Job', jobSchema);
export default Job;