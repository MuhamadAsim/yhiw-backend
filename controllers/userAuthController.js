import User from '../models/userModel.js';
import jwt from 'jsonwebtoken';

// Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id,
      firebaseUserId: user.firebaseUserId,
      email: user.email,
      role: user.role 
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '30d' }
  );
};

/**
 * @desc    Create a new user (Signup)
 * @route   POST /api/users
 * @access  Public
 */
export const createUser = async (req, res) => {
  try {
    const { firebaseUserId, fullName, email, phoneNumber, role } = req.body;

    // Validate required fields
    if (!firebaseUserId || !fullName || !email || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: firebaseUserId, fullName, email, phoneNumber'
      });
    }

    // Check if user already exists with this Firebase UID
    const existingUserByFirebaseId = await User.findOne({ firebaseUserId });
    if (existingUserByFirebaseId) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this Firebase account'
      });
    }

    // Check if email already exists
    const existingUserByEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingUserByEmail) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Check if phone number already exists
    const existingUserByPhone = await User.findOne({ phoneNumber });
    if (existingUserByPhone) {
      return res.status(409).json({
        success: false,
        message: 'Phone number already registered'
      });
    }

    // Create new user
    const newUser = await User.create({
      firebaseUserId,
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      phoneNumber,
      role: role || 'customer',
      status: 'active'
    });

    // Generate JWT token
    const token = generateToken(newUser);

    // Return user data with token
    const userResponse = {
      id: newUser._id,
      firebaseUserId: newUser.firebaseUserId,
      fullName: newUser.fullName,
      email: newUser.email,
      phoneNumber: newUser.phoneNumber,
      role: newUser.role,
      status: newUser.status,
      createdAt: newUser.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userResponse,
      token: token  // Send token to frontend
    });

  } catch (error) {
    console.error('Create User Error:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        message: `${field} already exists`
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error creating user'
    });
  }
};

/**
 * @desc    Get user by Firebase UID (Signin)
 * @route   GET /api/users/:firebaseUserId
 * @access  Public (for initial signin, should be protected later)
 */
export const getUserByFirebaseId = async (req, res) => {
  try {
    const { firebaseUserId } = req.params;

    if (!firebaseUserId) {
      return res.status(400).json({
        success: false,
        message: 'Firebase User ID is required'
      });
    }

    const user = await User.findOne({ firebaseUserId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate JWT token
    const token = generateToken(user);

    // Return user data with token
    const userResponse = {
      id: user._id,
      firebaseUserId: user.firebaseUserId,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.status(200).json({
      success: true,
      data: userResponse,
      token: token  // Send token to frontend
    });

  } catch (error) {
    console.error('Get User Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user'
    });
  }
};

/**
 * @desc    Update user profile
 * @route   PUT /api/users/:firebaseUserId
 * @access  Private (user can update their own profile)
 */
export const updateUser = async (req, res) => {
  try {
    const { firebaseUserId } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated
    delete updates.firebaseUserId;
    delete updates.email; // Email should only be changed through auth system
    delete updates._id;
    delete updates.createdAt;

    const user = await User.findOne({ firebaseUserId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user fields
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        user[key] = updates[key];
      }
    });

    await user.save();

    // Generate new token (optional - if you want to refresh token)
    const token = generateToken(user);

    // Return updated user with new token
    const userResponse = {
      id: user._id,
      firebaseUserId: user.firebaseUserId,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: userResponse,
      token: token  // Optional: send new token
    });

  } catch (error) {
    console.error('Update User Error:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate field value'
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error updating user'
    });
  }
};

/**
 * @desc    Delete ALL users from the database (DANGER ZONE)
 * @route   DELETE /api/users/delete-all
 * @access  Private/Admin only (should be protected)
 */
export const deleteAllUsers = async (req, res) => {
  try {
    // Count users before deletion
    const userCount = await User.countDocuments();
    
    if (userCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'No users found to delete'
      });
    }

    // Delete all users
    const result = await User.deleteMany({});

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} users from the database`,
      data: {
        deletedCount: result.deletedCount,
        totalUsersBefore: userCount
      }
    });

  } catch (error) {
    console.error('Delete All Users Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting users',
      error: error.message
    });
  }
};