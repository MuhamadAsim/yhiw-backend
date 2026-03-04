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
      type: String,
      makeModel: String,
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
  
  // Job status
  status: {
    type: String,
    enum: ['accepted', 'in_progress', 'completed', 'cancelled'],
    default: 'accepted'
  },
  
  // Timeline
  acceptedAt: { type: Date, default: Date.now },
  startedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  cancelledBy: {
    type: String,
    enum: ['customer', 'provider', 'system']
  },
  
  // Live tracking
  currentLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  },
  
  // Ratings (after completion)
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