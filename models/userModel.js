import mongoose from 'mongoose';

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
  // For role-based access (customer, service-provider, admin)
  role: {
    type: String,
    enum: ['customer', 'provider'],
    default: 'customer'
  },
  profileImage: String,
  // Account status
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
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

// Indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ phoneNumber: 1 });
userSchema.index({ firebaseUserId: 1 });
userSchema.index({ createdAt: -1 });

// Middleware to update updatedAt on save
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const User = mongoose.model('User', userSchema);

export default User;