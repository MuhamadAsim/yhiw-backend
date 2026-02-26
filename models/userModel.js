import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  firebaseUserId: {
    type: String,
    required: true,
    unique: true  // ← This creates an index automatically
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,  // ← This creates an index automatically
    lowercase: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true
    // Note: phoneNumber is NOT unique here - is this intentional?
  },
  role: {
    type: String,
    enum: ['customer', 'provider'],
    default: 'customer'
  },
  profileImage: String,
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true  // This automatically adds createdAt and updatedAt
});



const User = mongoose.model('User', userSchema);
export default User;