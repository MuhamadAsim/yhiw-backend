import mongoose from 'mongoose';

const savedLocationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['home', 'work', 'other'],
    default: 'other'
  },
  placeId: {
    type: String,
    sparse: true
  },
  isFavorite: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

const recentLocationSchema = new mongoose.Schema({
  title: String,
  address: String,
  latitude: Number,
  longitude: Number,
  placeId: String,
  lastUsed: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const userSchema = new mongoose.Schema({
  firebaseUserId: {
    type: String,
    required: true,
    unique: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['customer', 'provider', 'admin'],
    default: 'customer'
  },
  profileImage: String,
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  // Saved locations array
  savedLocations: [savedLocationSchema],
  
  // Recent locations (for quick access)
  recentLocations: {
    type: [recentLocationSchema],
    default: [],
    maxItems: 20 // Keep only last 20 recent locations
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
userSchema.index({ 'savedLocations.type': 1 });
userSchema.index({ 'savedLocations.isFavorite': 1 });

const User = mongoose.model('User', userSchema);
export default User;