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
      required: true,
      validate: {
        validator: function(v) {
          return v.length === 2 && 
                 v[0] >= -180 && v[0] <= 180 && // longitude
                 v[1] >= -90 && v[1] <= 90;      // latitude
        },
        message: 'Invalid coordinates format'
      }
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

}, { 
  timestamps: true 
});

// ============== FIXED GEOSPATIAL INDEX ==============
// Create ONLY ONE 2dsphere index for geospatial queries
// This is the correct way to set up a geospatial index
providerLiveStatusSchema.index({ 
  currentLocation: '2dsphere' 
});

// ============== ADDITIONAL INDEXES ==============
// Index for querying online/available providers
providerLiveStatusSchema.index({ isOnline: 1, isAvailable: 1, lastSeen: -1 });
providerLiveStatusSchema.index({ providerId: 1 });

// ============== INSTANCE METHODS ==============
// Update location
providerLiveStatusSchema.methods.updateLocation = function(lat, lng, address, isManual = false) {
  this.currentLocation = {
    type: 'Point',
    coordinates: [lng, lat], // GeoJSON uses [longitude, latitude]
    address: address,
    isManual: isManual,
    lastUpdated: new Date()
  };
  this.lastSeen = new Date();
  return this.save();
};

// Go online
providerLiveStatusSchema.methods.goOnline = function(lat, lng, address) {
  this.isOnline = true;
  this.isAvailable = true;
  this.lastSeen = new Date();
  if (lat && lng) {
    this.currentLocation = {
      type: 'Point',
      coordinates: [lng, lat],
      address: address || '',
      lastUpdated: new Date()
    };
  }
  return this.save();
};

// Go offline
providerLiveStatusSchema.methods.goOffline = function() {
  this.isOnline = false;
  this.isAvailable = false;
  this.currentTaskId = null;
  this.lastSeen = new Date();
  return this.save();
};

// Start a task
providerLiveStatusSchema.methods.startTask = function(taskId) {
  this.isAvailable = false;
  this.currentTaskId = taskId;
  this.lastSeen = new Date();
  return this.save();
};

// Complete a task
providerLiveStatusSchema.methods.completeTask = function() {
  this.isAvailable = true;
  this.currentTaskId = null;
  this.lastSeen = new Date();
  return this.save();
};

// ============== STATIC METHODS ==============
// Find nearby providers
providerLiveStatusSchema.statics.findNearby = async function(lat, lng, maxDistanceKm = 5) {
  return this.aggregate([
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        distanceField: 'distance',
        maxDistance: maxDistanceKm * 1000,
        spherical: true,
        query: {
          isOnline: true,
          isAvailable: true,
          lastSeen: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // Active in last 5 mins
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'providerId',
        foreignField: '_id',
        as: 'providerInfo'
      }
    },
    {
      $unwind: '$providerInfo'
    },
    {
      $project: {
        providerId: 1,
        distance: 1,
        'providerInfo.fullName': 1,
        'providerInfo.rating': 1,
        'providerInfo.profileImage': 1,
        'providerInfo.serviceType': 1,
        currentLocation: 1,
        isOnline: 1,
        isAvailable: 1
      }
    },
    {
      $sort: { distance: 1 }
    }
  ]);
};

// Get online providers count
providerLiveStatusSchema.statics.getOnlineCount = async function() {
  return this.countDocuments({
    isOnline: true,
    lastSeen: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
  });
};

const ProviderLiveStatus = mongoose.model('ProviderLiveStatus', providerLiveStatusSchema);

export default ProviderLiveStatus;