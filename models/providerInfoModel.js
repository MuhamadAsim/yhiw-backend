// models/providerProfileModel.js
import mongoose from 'mongoose';

const providerProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // One provider profile per user
  },
  // Location
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      index: '2dsphere' // For geospatial queries
    }
  },


  // Professional Info
  serviceType: {
    type: [String], // Array of services they provide
    required: true,
    enum: ['plumbing', 'electrical', 'carpentry', 'cleaning', 'painting', 'moving', 'gardening', 'other']
  },

 

  description: {
    type: String,
    maxLength: 500
  },
  
 
  // Stats
  totalJobsCompleted: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  totalEarnings: {
    type: Number,
    default: 0
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create geospatial index for location-based searches
providerProfileSchema.index({ location: '2dsphere' });

// Index for searching
providerProfileSchema.index({ serviceType: 1, rating: -1 });
providerProfileSchema.index({ city: 1, serviceType: 1 });

const ProviderProfile = mongoose.model('ProviderProfile', providerProfileSchema);
export default ProviderProfile;