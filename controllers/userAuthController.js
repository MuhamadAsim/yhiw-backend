import User from '../models/userModel.js';
import jwt from 'jsonwebtoken';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import Job from '../models/jobModel.js';
import Notification from '../models/notificationModel.js';
import mongoose from 'mongoose';






// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d' // Token expires in 30 days
  });
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
    const token = generateToken(newUser._id);

    // Return user data with token
    const userResponse = {
      id: newUser._id,
      firebaseUserId: newUser.firebaseUserId,
      fullName: newUser.fullName,
      email: newUser.email,
      phoneNumber: newUser.phoneNumber,
      role: newUser.role,
      status: newUser.status,
      createdAt: newUser.createdAt,
      token // Include JWT token in response
    };

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userResponse
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

    // Generate new JWT token for signin
    const token = generateToken(user._id);

    // Return user data with token (same structure as signup)
    const userResponse = {
      id: user._id,
      firebaseUserId: user.firebaseUserId,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      token // Include JWT token in response
    };

    res.status(200).json({
      success: true,
      data: userResponse
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

    // Return updated user
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
      data: userResponse
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
export const deleteAllUsers = async () => {
  try {
    // Count users before deletion
    const userCount = await User.countDocuments();
    
    if (userCount === 0) {
      console.log('No users found to delete');
      return {
        success: false,
        message: 'No users found to delete'
      };
    }

    // Delete all users
    const result = await User.deleteMany({});

    const response = {
      success: true,
      message: `Successfully deleted ${result.deletedCount} users from the database`,
      data: {
        deletedCount: result.deletedCount,
        totalUsersBefore: userCount
      }
    };

    console.log(response.message);
    return response;

  } catch (error) {
    console.error('Delete All Users Error:', error);
    return {
      success: false,
      message: 'Server error deleting users',
      error: error.message
    };
  }
};










/**
 * @desc    Print all jobs with their status (for debugging)
 * @route   GET /api/jobs/print-all
 * @access  Private/Admin only
 */
export const printAllUsers = async () => {
  try {

    const countBefore = await Job.countDocuments();

    console.log('\n========== PRINTING ALL JOBS ==========');
    console.log(`📊 Total jobs found in Job model: ${countBefore}`);
    console.log('=========================================\n');

    if (countBefore === 0) {
      console.log('No jobs found in Job model');
      return {
        success: true,
        message: 'No jobs found',
        totalJobs: 0
      };
    }

    // Fetch all jobs with selected fields
    const jobs = await Job.find({}, { 
      status: 1, 
      serviceType: 1,
      createdAt: 1,
      customerName: 1 
    }).sort({ createdAt: -1 }); // Sort by newest first

    console.log('\n📋 Job Status List:\n');

    jobs.forEach((job, index) => {
      const createdAt = job.createdAt ? new Date(job.createdAt).toLocaleString() : 'N/A';
      console.log(`${index + 1}. Job ID: ${job._id}`);
      console.log(`   Status: ${job.status}`);
      console.log(`   Service: ${job.serviceType || 'N/A'}`);
      console.log(`   Customer: ${job.customerName || 'N/A'}`);
      console.log(`   Created: ${createdAt}`);
      console.log('   --------------------');
    });

    console.log('\n📊 Summary:');
    console.log(`   Total Jobs: ${jobs.length}`);

    // Count by status
    const statusCounts = {};
    jobs.forEach(job => {
      const status = job.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    console.log('\n📈 Jobs by Status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });

    console.log('\n=========================================\n');

    return {
      success: true,
      message: `Successfully printed ${jobs.length} jobs`,
      totalJobs: jobs.length,
      jobs: jobs.map(j => ({
        id: j._id,
        status: j.status,
        serviceType: j.serviceType,
        customerName: j.customerName,
        createdAt: j.createdAt
      }))
    };

  } catch (error) {
    console.error('Print All Jobs Error:', error);
    return {
      success: false,
      message: 'Server error printing jobs',
      error: error.message
    };
  }
};





// export const printAllUsers = async () => {
//   try {
//     console.log("\n========== RESETTING JOB COLLECTION ==========");

//     // Count before deletion
//     const countBefore = await Job.countDocuments();
//     console.log(`📊 Jobs before reset: ${countBefore}`);

//     // Print existing indexes
//     const indexes = await mongoose.connection.collection("jobs").indexes();

//     console.log("\n📑 Existing Indexes:");
//     indexes.forEach((index) => {
//       console.log(`- ${index.name}`);
//     });

//     // Remove old jobNumber index if it exists
//     const jobNumberIndex = indexes.find(
//       (index) => index.name === "jobNumber_1"
//     );

//     if (jobNumberIndex) {
//       await mongoose.connection.collection("jobs").dropIndex("jobNumber_1");
//       console.log("🗑 Removed old index: jobNumber_1");
//     }

//     // Delete ONLY non-completed jobs (keep completed ones)
//     const deleteQuery = {
//       status: { 
//         $nin: ['completed', 'completed_confirmed'] 
//       }
//     };
    
//     const result = await Job.deleteMany(deleteQuery);

//     console.log(`🗑 Deleted ${result.deletedCount} non-completed jobs`);
//     console.log(`✅ Preserved completed and completed_confirmed jobs`);

//     // Verify deletion
//     const countAfter = await Job.countDocuments();
//     const completedCount = await Job.countDocuments({ 
//       status: { $in: ['completed', 'completed_confirmed'] } 
//     });
    
//     console.log(`📊 Jobs after reset: ${countAfter} total`);
//     console.log(`📊 Completed jobs preserved: ${completedCount}`);

//     console.log("==============================================\n");

//     return {
//       success: true,
//       deletedCount: result.deletedCount,
//       preservedCount: completedCount
//     };

//   } catch (error) {
//     console.error("\n❌ RESET JOBS ERROR:", error.message);
//     return {
//       success: false,
//       error: error.message
//     };
//   }
// };







