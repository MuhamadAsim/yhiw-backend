import mongoose from 'mongoose';

const providerLiveStatusSchema = new mongoose.Schema({
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Firebase ID for WebSocket connections
  firebaseUserId: {
    type: String,
    required: true
  },

  isOnline: {
    type: Boolean,
    default: false
  },

  isAvailable: {
    type: Boolean,
    default: true
  },

  // Current active job (if any)
  currentJobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    default: null
  },

  // Current booking ID (for quick reference)
  currentBookingId: {
    type: String,
    default: null
  },

  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      default: [0, 0]
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

  // Service areas/capabilities
  serviceCategories: [{
    type: String,
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
  }],

  // Service radius in km
  serviceRadius: {
    type: Number,
    default: 10
  },

  lastSeen: {
    type: Date,
    default: Date.now
  },

  heading: {
    type: Number, // Direction in degrees (0-360)
    min: 0,
    max: 360
  },
  
  speed: {
    type: Number, // Speed in km/h
    min: 0
  },

  // Provider stats (for quick access)
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalJobsCompleted: {
    type: Number,
    default: 0
  },

  // Current task/job reference
  currentTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  }

}, { timestamps: true });

// Indexes
providerLiveStatusSchema.index({ currentLocation: '2dsphere' });
providerLiveStatusSchema.index({ isOnline: 1, isAvailable: 1 });
providerLiveStatusSchema.index({ firebaseUserId: 1 });
providerLiveStatusSchema.index({ serviceCategories: 1 });

const ProviderLiveStatus = mongoose.model('ProviderLiveStatus', providerLiveStatusSchema);
export default ProviderLiveStatus;