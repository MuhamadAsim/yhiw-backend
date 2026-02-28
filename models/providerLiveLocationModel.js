// models/providerLiveLocationModel.js
import mongoose from 'mongoose';

const providerLiveStatusSchema = new mongoose.Schema({
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  isOnline: {
    type: Boolean,
    default: false
  },

  isAvailable: {
    type: Boolean,
    default: true
  },

  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      // REMOVE the inline index from here
      required: true // Add this to ensure coordinates are always present
    },
    isManual: {
      type: Boolean,
      default: false
    },
    address: {
      type: String,
      default: ''
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },

  lastSeen: {
    type: Date,
    default: Date.now
  },

  currentTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  }

}, { timestamps: true });

// Create ONLY ONE 2dsphere index for geospatial queries
providerLiveStatusSchema.index({ currentLocation: '2dsphere' });

const ProviderLiveStatus = mongoose.model('ProviderLiveStatus', providerLiveStatusSchema);
export default ProviderLiveStatus;