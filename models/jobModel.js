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
    default: null,
    index: { expires: 0 } // This tells MongoDB to delete when this time is reached
  }

}, {
  timestamps: true
});


// Indexes for better query performance
jobSchema.index({ providerId: 1, createdAt: -1 });
jobSchema.index({ customerId: 1, createdAt: -1 });
jobSchema.index({ status: 1 });
jobSchema.index({ jobNumber: 1 }, { unique: true });
jobSchema.index({ completedAt: 1 });
jobSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
jobSchema.index({ 'pickupLocation.latitude': 1, 'pickupLocation.longitude': 1 });



const Job = mongoose.model('Job', jobSchema);


export default Job;