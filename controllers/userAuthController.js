import User from '../models/userModel.js';
import jwt from 'jsonwebtoken';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import Job from '../models/jobModel.js';





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
 * @desc    Print all users to console with location and online status (for debugging)
 * @route   GET /api/users/print-all
 * @access  Private/Admin only
 */
export const printAllUsers = async () => {
  try {
    // Get all users
    const users = await User.find({}).lean();
    
    // Get all provider live statuses
    const providerStatuses = await ProviderLiveStatus.find({}).lean();
    
    // Create a map for quick lookup
    const statusMap = {};
    providerStatuses.forEach(status => {
      statusMap[status.providerId.toString()] = status;
    });
    
    console.log('\n========== ALL USERS WITH LOCATION & STATUS ==========');
    console.log(`Total users: ${users.length}`);
    console.log('=====================================================\n');
    
    if (users.length === 0) {
      console.log('No users found in database');
    } else {
      users.forEach((user, index) => {
        const providerStatus = statusMap[user._id.toString()];
        const isProvider = user.role === 'provider';
        
        console.log(`========== User ${index + 1} ==========`);
        console.log(`🔑 ID: ${user._id}`);
        console.log(`🔥 Firebase UID: ${user.firebaseUserId}`);
        console.log(`👤 Full Name: ${user.fullName}`);
        console.log(`📧 Email: ${user.email}`);
        console.log(`📱 Phone: ${user.phoneNumber}`);
        console.log(`🎭 Role: ${user.role}`);
        console.log(`✅ Status: ${user.status}`);
        
        // Provider-specific info
        if (isProvider) {
          console.log(`\n--- PROVIDER INFO ---`);
          console.log(`🔧 Service Type: ${user.serviceType?.join(', ') || 'Not specified'}`);
          console.log(`📝 Description: ${user.description || 'No description'}`);
          console.log(`⭐ Rating: ${user.rating || 0} (${user.totalReviews || 0} reviews)`);
          console.log(`💰 Total Earnings: ${user.totalEarnings || 0} BHD`);
          console.log(`📊 Jobs Completed: ${user.totalJobsCompleted || 0}`);
          
          console.log(`\n📍 LIVE STATUS:`);
          if (providerStatus) {
            // Calculate if provider is actually online based on lastSeen
            const now = new Date();
            const lastSeen = new Date(providerStatus.lastSeen);
            const timeDiffInSeconds = Math.floor((now - lastSeen) / 1000);
            const isActuallyOnline = providerStatus.isOnline && timeDiffInSeconds <= 90; // 1.5 minutes = 90 seconds
            
            console.log(`   🟢 DB Online Flag: ${providerStatus.isOnline ? 'YES' : 'NO'}`);
            console.log(`   🟢 Actually Online: ${isActuallyOnline ? 'YES' : 'NO'} (based on lastSeen)`);
            console.log(`   🟢 Available: ${providerStatus.isAvailable ? 'YES' : 'NO'}`);
            console.log(`   🕒 Last Seen: ${providerStatus.lastSeen}`);
            console.log(`   ⏱️ Time since last update: ${timeDiffInSeconds} seconds`);
            
            if (timeDiffInSeconds > 90) {
              console.log(`   ⚠️ WARNING: Provider marked online but last update was ${Math.floor(timeDiffInSeconds / 60)} minutes ${timeDiffInSeconds % 60} seconds ago!`);
            }
            
            // FIXED: Check for currentLocation and its coordinates properly
            if (providerStatus.currentLocation && 
                providerStatus.currentLocation.coordinates && 
                providerStatus.currentLocation.coordinates.length === 2) {
              
              const [lng, lat] = providerStatus.currentLocation.coordinates;
              console.log(`   📌 Location:`);
              console.log(`      • Latitude: ${lat.toFixed(6)}`);
              console.log(`      • Longitude: ${lng.toFixed(6)}`);
              console.log(`      • Google Maps: https://www.google.com/maps?q=${lat},${lng}`);
              
              // Also show if it's manual or auto location (you'd need to add this field to your schema)
              // console.log(`      • Location Mode: ${providerStatus.locationMode || 'auto'}`);
              
              // Calculate how old the location is
              if (providerStatus.updatedAt) {
                const locationAge = Math.floor((now - new Date(providerStatus.updatedAt)) / 1000);
                console.log(`      • Location age: ${locationAge} seconds ago`);
                
                // Try to get the actual location update time from the location data
                // This assumes you're sending timestamp in the location update
                if (providerStatus.currentLocation.timestamp) {
                  const locationTimestamp = new Date(providerStatus.currentLocation.timestamp);
                  const locationAgeFromData = Math.floor((now - locationTimestamp) / 1000);
                  console.log(`      • Location data age: ${locationAgeFromData} seconds ago (from client)`);
                }
              }
            } else {
              console.log(`   📌 Location: Not set`);
            }
            
            if (providerStatus.currentTaskId) {
              console.log(`   🔄 Current Task: ${providerStatus.currentTaskId}`);
            }
          } else {
            console.log(`   📍 No live status record found`);
            console.log(`   🟢 Online: NO (never went online)`);
          }
        } else {
          // Customer info
          console.log(`\n--- CUSTOMER INFO ---`);
          console.log(`📍 Saved Locations: ${user.savedLocations?.length || 0}`);
          console.log(`🕒 Recent Locations: ${user.recentLocations?.length || 0}`);
        }
        
        console.log(`📅 Created: ${user.createdAt}`);
        console.log(`🔄 Updated: ${user.updatedAt}`);
        console.log('=========================================\n');
      });
      
      // Print summary statistics with actual online status
      console.log('\n========== SUMMARY STATISTICS ==========');
      const providers = users.filter(u => u.role === 'provider');
      const customers = users.filter(u => u.role === 'customer');
      
      // Calculate actual online status based on lastSeen
      const now = new Date();
      let actuallyOnlineCount = 0;
      let staleOnlineCount = 0;
      let providersWithLocation = 0;
      
      providerStatuses.forEach(status => {
        if (status.currentLocation && 
            status.currentLocation.coordinates && 
            status.currentLocation.coordinates.length === 2) {
          providersWithLocation++;
        }
        
        if (status.isOnline) {
          const lastSeen = new Date(status.lastSeen);
          const timeDiffInSeconds = Math.floor((now - lastSeen) / 1000);
          
          if (timeDiffInSeconds <= 90) {
            actuallyOnlineCount++;
          } else {
            staleOnlineCount++;
          }
        }
      });
      
      const onlineProviders = providerStatuses.filter(s => s.isOnline).length;
      
      console.log(`Total Providers: ${providers.length}`);
      console.log(`Total Customers: ${customers.length}`);
      console.log(`Providers marked Online in DB: ${onlineProviders}`);
      console.log(`📱 Actually Online (last 90 sec): ${actuallyOnlineCount}`);
      console.log(`⚠️ Stale Online (>90 sec ago): ${staleOnlineCount}`);
      console.log(`📍 Providers with Location: ${providersWithLocation}`);
      
      // List providers with location
      if (providersWithLocation > 0) {
        console.log('\n--- PROVIDERS WITH LOCATION ---');
        providerStatuses.forEach(status => {
          if (status.currentLocation && 
              status.currentLocation.coordinates && 
              status.currentLocation.coordinates.length === 2) {
            const provider = users.find(u => u._id.toString() === status.providerId.toString());
            const [lng, lat] = status.currentLocation.coordinates;
            console.log(`• ${provider?.fullName || 'Unknown'}: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
          }
        });
      }
      
      // List stale providers
      if (staleOnlineCount > 0) {
        console.log('\n--- STALE PROVIDERS (marked online but no recent update) ---');
        providerStatuses.forEach(status => {
          if (status.isOnline) {
            const lastSeen = new Date(status.lastSeen);
            const timeDiffInSeconds = Math.floor((now - lastSeen) / 1000);
            
            if (timeDiffInSeconds > 90) {
              const provider = users.find(u => u._id.toString() === status.providerId.toString());
              console.log(`• ${provider?.fullName || 'Unknown'}: ${Math.floor(timeDiffInSeconds / 60)}m ${timeDiffInSeconds % 60}s ago`);
            }
          }
        });
      }
      
      console.log('=========================================\n');
    }

    return {
      success: true,
      message: `Printed ${users.length} users to console`,
      count: users.length,
      stats: {
        totalUsers: users.length,
        providers: users.filter(u => u.role === 'provider').length,
        customers: users.filter(u => u.role === 'customer').length,
        onlineProviders: onlineProviders,
        actuallyOnline: actuallyOnlineCount,
        staleOnline: staleOnlineCount,
        providersWithLocation: providersWithLocation
      }
    };

  } catch (error) {
    console.error('Print Users Error:', error);
    return {
      success: false,
      message: 'Server error printing users',
      error: error.message
    };
  }
};