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












// /**
//  * @desc    Delete all jobs from the Job model (for cleanup/debugging)
//  * @route   DELETE /api/jobs/delete-all
//  * @access  Private/Admin only
//  */
// export const printAllUsers = async () => {
//   try {

//     const countBefore = await Job.countDocuments();

//     console.log('\n========== DELETING ALL JOBS ==========');
//     console.log(`📊 Jobs found in Job model before deletion: ${countBefore}`);
//     console.log('=========================================\n');

//     if (countBefore === 0) {
//       console.log('No jobs found in Job model to delete');
//       return {
//         success: true,
//         message: 'No jobs found to delete',
//         deletedCount: 0
//       };
//     }

//     // Fetch all jobs to print their status
//     const jobs = await Job.find({}, { status: 1 });

//     console.log('\n📋 Job Status Before Deletion:\n');

//     jobs.forEach((job, index) => {
//       console.log(`${index + 1}. Job ID: ${job._id} | Status: ${job.status}`);
//     });

//     console.log('\n=========================================\n');

//     // Delete all jobs
//     // const result = await Job.deleteMany({});

//     console.log(`✅ Deleted ${result.deletedCount} jobs from Job model`);
//     console.log('=========================================\n');

//     // Verify deletion
//     const countAfter = await Job.countDocuments();
//     console.log(`📊 Jobs after deletion: ${countAfter}`);

//     return {
//       success: true,
//       message: `Successfully deleted ${result.deletedCount} jobs from Job model`,
//       deletedCount: result.deletedCount
//     };

//   } catch (error) {
//     console.error('Delete All Jobs Error:', error);
//     return {
//       success: false,
//       message: 'Server error deleting jobs',
//       error: error.message
//     };
//   }
// };








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









/**
 * @desc    Print all providers from the User model (for debugging)
 * @route   GET /api/users/print-all-providers
 * @access  Private/Admin only
 */
export const printAllUsers = async (req, res) => {
  try {
    const countProviders = await User.countDocuments({ role: 'provider' });

    console.log('\n========== FETCHING ALL PROVIDERS ==========');
    console.log(`📊 Providers found in User model: ${countProviders}`);
    console.log('=============================================\n');

    if (countProviders === 0) {
      return res.json({
        success: true,
        message: 'No providers found',
        count: 0,
        googleMapsTest: await testGoogleMapsKeys()
      });
    }

    // Fetch all providers with relevant fields
    const providers = await User.find(
      { role: 'provider' },
      {
        fullName: 1,
        email: 1,
        phoneNumber: 1,
        status: 1,
        serviceType: 1,
        rating: 1,
        totalReviews: 1,
        totalJobsCompleted: 1,
        totalEarnings: 1,
        description: 1,
        createdAt: 1
      }
    );

    console.log('📋 Provider Details:\n');

    providers.forEach((provider, index) => {
      console.log(`${index + 1}. ----------------------------------------`);
      console.log(`   🆔 ID           : ${provider._id}`);
      console.log(`   👤 Full Name    : ${provider.fullName}`);
      console.log(`   📧 Email        : ${provider.email}`);
      console.log(`   📞 Phone        : ${provider.phoneNumber}`);
      console.log(`   🔄 Status       : ${provider.status}`);
      console.log(`   🛠️  Services     : ${provider.serviceType?.join(', ') || 'N/A'}`);
      console.log(`   ⭐ Rating       : ${provider.rating} (${provider.totalReviews} reviews)`);
      console.log(`   ✅ Jobs Done    : ${provider.totalJobsCompleted}`);
      console.log(`   💰 Earnings     : $${provider.totalEarnings}`);
      console.log(`   📝 Description  : ${provider.description || 'N/A'}`);
      console.log(`   📅 Joined       : ${provider.createdAt?.toISOString().split('T')[0]}`);
    });

    console.log('\n=============================================\n');
    console.log(`✅ Total providers printed: ${providers.length}`);
    console.log('=============================================\n');

    // Test Google Maps API keys
    const googleMapsTest = await testGoogleMapsKeys();

    res.json({
      success: true,
      message: `Successfully fetched ${providers.length} providers`,
      count: providers.length,
      providers: providers.map(p => ({
        id: p._id,
        name: p.fullName,
        email: p.email,
        phone: p.phoneNumber,
        status: p.status,
        services: p.serviceType,
        rating: p.rating,
        jobsCompleted: p.totalJobsCompleted
      })),
      googleMapsTest
    });

  } catch (error) {
    console.error('Print All Providers Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching providers',
      error: error.message
    });
  }
};

/**
 * Test Google Maps API keys with random locations
 */
async function testGoogleMapsKeys() {
  console.log('\n========== TESTING GOOGLE MAPS API KEYS ==========');
  
  // List of Google Maps API keys to test
  const apiKeys = [
    { 
      name: 'Primary Key', 
      key: process.env.GOOGLE_MAPS_API_KEY
    },
    { 
      name: 'Secondary Key', 
      key: "AIzaSyDYrX8rOSmDJ4tcsnjRU1yK3IjWoIiJ67A"
    },
  
  ].filter(k => k.key); // Only include keys that exist

  // Random locations around Bahrain for testing
  const testLocations = [
    {
      name: 'Manama to Riffa',
      origin: { lat: 26.2285, lng: 50.5860 }, // Manama
      destination: { lat: 26.1300, lng: 50.5550 } // Riffa
    },
    {
      name: 'Muharraq to Isa Town',
      origin: { lat: 26.2572, lng: 50.6119 }, // Muharraq
      destination: { lat: 26.1736, lng: 50.5476 } // Isa Town
    },
    {
      name: 'Seef to Juffair',
      origin: { lat: 26.2355, lng: 50.5311 }, // Seef
      destination: { lat: 26.2185, lng: 50.6056 } // Juffair
    }
  ];

  const results = [];

  for (const keyInfo of apiKeys) {
    console.log(`\n🔑 Testing ${keyInfo.name}: ${keyInfo.key.substring(0, 10)}...`);
    
    const keyResults = {
      keyName: keyInfo.name,
      keyPrefix: keyInfo.key.substring(0, 10),
      tests: []
    };

    // Test 1: Geocoding API (convert address to coordinates)
    try {
      console.log(`  📍 Testing Geocoding API...`);
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=Manama,Bahrain&key=${keyInfo.key}`;
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();
      
      keyResults.tests.push({
        api: 'Geocoding',
        status: geocodeData.status === 'OK' ? '✅ Working' : `❌ Failed: ${geocodeData.status}`,
        results: geocodeData.status === 'OK' ? {
          location: geocodeData.results[0]?.formatted_address,
          coordinates: geocodeData.results[0]?.geometry.location
        } : null
      });
    } catch (error) {
      keyResults.tests.push({
        api: 'Geocoding',
        status: `❌ Error: ${error.message}`
      });
    }

    // Test 2: Distance Matrix API with random locations
    try {
      console.log(`  🗺️  Testing Distance Matrix API...`);
      const randomLocation = testLocations[Math.floor(Math.random() * testLocations.length)];
      
      const distanceUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${randomLocation.origin.lat},${randomLocation.origin.lng}&destinations=${randomLocation.destination.lat},${randomLocation.destination.lng}&key=${keyInfo.key}`;
      
      const distanceResponse = await fetch(distanceUrl);
      const distanceData = await distanceResponse.json();
      
      if (distanceData.status === 'OK' && distanceData.rows[0]?.elements[0]?.status === 'OK') {
        keyResults.tests.push({
          api: 'Distance Matrix',
          status: '✅ Working',
          results: {
            route: randomLocation.name,
            distance: distanceData.rows[0].elements[0].distance.text,
            duration: distanceData.rows[0].elements[0].duration.text
          }
        });
      } else {
        keyResults.tests.push({
          api: 'Distance Matrix',
          status: `❌ Failed: ${distanceData.status}`,
          error: distanceData.error_message || 'Unknown error'
        });
      }
    } catch (error) {
      keyResults.tests.push({
        api: 'Distance Matrix',
        status: `❌ Error: ${error.message}`
      });
    }

    // Test 3: Directions API
    try {
      console.log(`  🧭 Testing Directions API...`);
      const randomLocation = testLocations[Math.floor(Math.random() * testLocations.length)];
      
      const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${randomLocation.origin.lat},${randomLocation.origin.lng}&destination=${randomLocation.destination.lat},${randomLocation.destination.lng}&key=${keyInfo.key}`;
      
      const directionsResponse = await fetch(directionsUrl);
      const directionsData = await directionsResponse.json();
      
      if (directionsData.status === 'OK') {
        const route = directionsData.routes[0];
        keyResults.tests.push({
          api: 'Directions',
          status: '✅ Working',
          results: {
            route: randomLocation.name,
            distance: route.legs[0].distance.text,
            duration: route.legs[0].duration.text,
            steps: route.legs[0].steps.length,
            polyline: route.overview_polyline.points.substring(0, 20) + '...'
          }
        });
      } else {
        keyResults.tests.push({
          api: 'Directions',
          status: `❌ Failed: ${directionsData.status}`,
          error: directionsData.error_message || 'Unknown error'
        });
      }
    } catch (error) {
      keyResults.tests.push({
        api: 'Directions',
        status: `❌ Error: ${error.message}`
      });
    }

    // Test 4: Places API (Autocomplete)
    try {
      console.log(`  🏪 Testing Places API (Autocomplete)...`);
      const placesUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=restaurant in Manama&key=${keyInfo.key}`;
      
      const placesResponse = await fetch(placesUrl);
      const placesData = await placesResponse.json();
      
      if (placesData.status === 'OK') {
        keyResults.tests.push({
          api: 'Places Autocomplete',
          status: '✅ Working',
          results: {
            predictions: placesData.predictions.slice(0, 3).map(p => p.description)
          }
        });
      } else {
        keyResults.tests.push({
          api: 'Places Autocomplete',
          status: `❌ Failed: ${placesData.status}`,
          error: placesData.error_message || 'Unknown error'
        });
      }
    } catch (error) {
      keyResults.tests.push({
        api: 'Places Autocomplete',
        status: `❌ Error: ${error.message}`
      });
    }

    // Test 5: Static Maps API
    try {
      console.log(`  🖼️  Testing Static Maps API...`);
      const randomLocation = testLocations[0]; // Use Manama
      const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${randomLocation.origin.lat},${randomLocation.origin.lng}&zoom=13&size=400x400&key=${keyInfo.key}`;
      
      // Just check if the URL is accessible (HEAD request)
      const staticMapResponse = await fetch(staticMapUrl, { method: 'HEAD' });
      
      keyResults.tests.push({
        api: 'Static Maps',
        status: staticMapResponse.ok ? '✅ Working' : `❌ Failed: HTTP ${staticMapResponse.status}`,
        url: staticMapUrl.substring(0, 100) + '...'
      });
    } catch (error) {
      keyResults.tests.push({
        api: 'Static Maps',
        status: `❌ Error: ${error.message}`
      });
    }

    // Calculate overall key status
    const workingTests = keyResults.tests.filter(t => t.status.includes('✅')).length;
    keyResults.overall = `${workingTests}/${keyResults.tests.length} APIs working`;
    
    results.push(keyResults);
    
    // Pretty print results for this key
    console.log(`\n  📊 Results for ${keyInfo.name}:`);
    keyResults.tests.forEach(test => {
      console.log(`    ${test.status}`);
      if (test.results) {
        if (test.api === 'Distance Matrix' && test.results.distance) {
          console.log(`      → ${test.results.distance}, ${test.results.duration}`);
        } else if (test.api === 'Directions' && test.results.distance) {
          console.log(`      → ${test.results.distance}, ${test.results.duration} (${test.results.steps} steps)`);
        } else if (test.api === 'Places Autocomplete' && test.results.predictions) {
          console.log(`      → ${test.results.predictions.join(', ')}`);
        }
      }
    });
    console.log(`  📈 Overall: ${keyResults.overall}`);
  }

  console.log('\n=============================================\n');
  
  return {
    timestamp: new Date().toISOString(),
    totalKeysTested: results.length,
    results
  };
}