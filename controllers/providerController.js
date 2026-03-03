// ==================== PROVIDER CONTROLLER ====================
import User from '../models/userModel.js';
import Job from '../models/jobModel.js';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import mongoose from 'mongoose';

// ==================== UPDATE PROVIDER LOCATION ====================
export const updateProviderLocation = async (req, res) => {
  try {
    const { providerId } = req.params; // This is the firebaseUserId from URL
    const { latitude, longitude, address, isManual, timestamp } = req.body;

    console.log('='.repeat(50));
    console.log('📍 UPDATE PROVIDER LOCATION');
    console.log('='.repeat(50));
    console.log('Provider ID (firebaseUserId):', providerId);
    console.log('Location:', { latitude, longitude, address });
    console.log('Mode:', isManual ? 'MANUAL' : 'AUTO');
    console.log('Timestamp:', timestamp);

    // Validate required fields
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    // Find provider by firebaseUserId
    const provider = await User.findOne({ 
      firebaseUserId: providerId,
      role: 'provider' 
    });

    if (!provider) {
      console.error('❌ Provider not found in User collection:', providerId);
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    console.log('✅ Provider found in database:', {
      id: provider._id,
      name: provider.fullName,
      firebaseUserId: provider.firebaseUserId
    });

    // Find or create live status - search by both firebaseUserId and providerId
    let liveStatus = await ProviderLiveStatus.findOne({ 
      $or: [
        { firebaseUserId: providerId },
        { providerId: provider._id }
      ]
    });

    if (!liveStatus) {
      console.log('📝 Creating new live status record for provider');
      liveStatus = new ProviderLiveStatus({
        providerId: provider._id,
        firebaseUserId: providerId, // CRITICAL: Set this!
        currentLocation: {
          type: 'Point',
          coordinates: [longitude, latitude], // MongoDB expects [longitude, latitude]
          isManual: isManual || false,
          address: address || '',
          lastUpdated: new Date()
        },
        isOnline: true,
        isAvailable: true,
        lastSeen: new Date()
      });
    } else {
      // Check if existing location is manual and new update is NOT manual
      const existingIsManual = liveStatus.currentLocation?.isManual || false;
      
      console.log(`🔄 Existing location mode: ${existingIsManual ? 'MANUAL' : 'AUTO'}`);
      console.log(`🔄 New update mode: ${isManual ? 'MANUAL' : 'AUTO'}`);

      // IMPORTANT: Preserve manual location if it exists and this is an auto update
      if (existingIsManual && !isManual) {
        console.log('✅ Preserving manual location, ignoring auto update');
        
        // Still update lastSeen to show provider is active
        liveStatus.lastSeen = new Date();
        liveStatus.isOnline = true;
        await liveStatus.save();
        
        return res.status(200).json({
          success: true,
          message: 'Manual location preserved',
          data: {
            location: {
              latitude: liveStatus.currentLocation.coordinates[1],
              longitude: liveStatus.currentLocation.coordinates[0],
              address: liveStatus.currentLocation.address,
              isManual: true
            },
            lastSeen: liveStatus.lastSeen
          }
        });
      }

      // Update location (either manual update OR auto update when no manual location exists)
      console.log(`📌 Updating location to ${isManual ? 'MANUAL' : 'AUTO'} mode`);
      
      liveStatus.currentLocation = {
        type: 'Point',
        coordinates: [longitude, latitude],
        isManual: isManual || false,
        address: address || liveStatus.currentLocation?.address || '',
        lastUpdated: new Date()
      };
      liveStatus.lastSeen = new Date();
      liveStatus.isOnline = true;
      
      // Make sure firebaseUserId is set (in case it was missing)
      if (!liveStatus.firebaseUserId) {
        liveStatus.firebaseUserId = providerId;
      }
    }

    await liveStatus.save();
    console.log('✅ Location updated successfully in database');
    console.log('📊 Live Status:', {
      providerId: liveStatus.providerId,
      firebaseUserId: liveStatus.firebaseUserId,
      location: liveStatus.currentLocation.coordinates,
      isManual: liveStatus.currentLocation.isManual,
      lastSeen: liveStatus.lastSeen
    });

    res.status(200).json({
      success: true,
      data: {
        location: {
          latitude,
          longitude,
          address,
          isManual: isManual || false,
          timestamp
        },
        lastSeen: liveStatus.lastSeen
      }
    });

  } catch (error) {
    console.error('❌ Error updating provider location:', error);
    console.error('Error stack:', error.stack);
    
    // Check for validation errors
    if (error.name === 'ValidationError') {
      console.error('Validation Error Details:', error.errors);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message,
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to update provider location',
      error: error.message
    });
  }
};

// ==================== GET PROVIDER STATUS ====================
export const getProviderStatus = async (req, res) => {
  try {
    const { providerId } = req.params; // firebaseUserId

    console.log(`🔍 Getting status for provider: ${providerId}`);

    // Find provider by firebaseUserId
    const provider = await User.findOne({ firebaseUserId: providerId });
    
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Get live status
    const liveStatus = await ProviderLiveStatus.findOne({ 
      $or: [
        { firebaseUserId: providerId },
        { providerId: provider._id }
      ]
    });

    const statusData = {
      isOnline: liveStatus?.isOnline || false,
      isAvailable: liveStatus?.isAvailable || true,
      currentLocation: liveStatus?.currentLocation ? {
        latitude: liveStatus.currentLocation.coordinates[1],
        longitude: liveStatus.currentLocation.coordinates[0],
        address: liveStatus.currentLocation.address,
        isManual: liveStatus.currentLocation.isManual,
        lastUpdated: liveStatus.currentLocation.lastUpdated
      } : null,
      currentJobId: liveStatus?.currentJobId || null,
      currentBookingId: liveStatus?.currentBookingId || null,
      lastSeen: liveStatus?.lastSeen || provider.lastSeen
    };

    res.json({
      success: true,
      data: statusData
    });

  } catch (error) {
    console.error('Error getting provider status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get provider status',
      error: error.message
    });
  }
};

// ==================== UPDATE PROVIDER STATUS ====================
export const updateProviderStatus = async (req, res) => {
  try {
    const { providerId } = req.params; // firebaseUserId
    const { isOnline, isAvailable, currentJobId, currentBookingId } = req.body;

    console.log(`🔄 Updating status for provider: ${providerId}`, {
      isOnline,
      isAvailable,
      currentJobId,
      currentBookingId
    });

    // Find provider by firebaseUserId
    const provider = await User.findOne({ firebaseUserId: providerId });
    
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Update or create live status
    const liveStatus = await ProviderLiveStatus.findOneAndUpdate(
      { $or: [{ firebaseUserId: providerId }, { providerId: provider._id }] },
      {
        $set: {
          providerId: provider._id,
          firebaseUserId: providerId,
          isOnline: isOnline !== undefined ? isOnline : true,
          isAvailable: isAvailable !== undefined ? isAvailable : true,
          currentJobId: currentJobId || null,
          currentBookingId: currentBookingId || null,
          lastSeen: new Date()
        }
      },
      { 
        upsert: true,
        new: true,
        runValidators: true
      }
    );

    console.log('✅ Provider status updated:', {
      isOnline: liveStatus.isOnline,
      isAvailable: liveStatus.isAvailable,
      lastSeen: liveStatus.lastSeen
    });

    res.json({
      success: true,
      data: {
        isOnline: liveStatus.isOnline,
        isAvailable: liveStatus.isAvailable,
        currentJobId: liveStatus.currentJobId,
        currentBookingId: liveStatus.currentBookingId,
        lastSeen: liveStatus.lastSeen
      }
    });

  } catch (error) {
    console.error('Error updating provider status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update provider status',
      error: error.message
    });
  }
};

// ==================== GET PROVIDER PERFORMANCE ====================
export const getProviderPerformance = async (req, res) => {
  try {
    const { providerId } = req.params; // firebaseUserId

    console.log(`📊 Getting performance for provider: ${providerId}`);

    // Find provider by firebaseUserId
    const provider = await User.findOne({ firebaseUserId: providerId });
    
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Get today's jobs
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayJobs = await Job.find({
      providerId: provider._id,
      status: 'completed',
      completedAt: { $gte: today }
    });

    // Calculate today's earnings (assuming 85% of job price)
    const todayEarnings = todayJobs.reduce((sum, job) => sum + (job.price * 0.85), 0);
    
    // Calculate total hours worked today (rough estimate - 30 min per job)
    const todayHours = todayJobs.length * 0.5;

    const performanceData = {
      earnings: todayEarnings,
      jobs: todayJobs.length,
      hours: todayHours,
      rating: provider.rating || 0
    };

    console.log('✅ Performance data:', performanceData);

    res.json({
      success: true,
      data: performanceData
    });

  } catch (error) {
    console.error('Error getting provider performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get provider performance',
      error: error.message
    });
  }
};

// ==================== GET PROVIDER PERFORMANCE WITH JOBS ====================
export const getProviderPerformanceWithJobs = async (req, res) => {
  try {
    const { providerId } = req.params; // firebaseUserId

    console.log(`📊 Getting detailed performance for provider: ${providerId}`);

    // Find provider by firebaseUserId
    const provider = await User.findOne({ firebaseUserId: providerId });
    
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Get today's jobs
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayJobs = await Job.find({
      providerId: provider._id,
      status: 'completed',
      completedAt: { $gte: today }
    });

    // Calculate today's earnings (assuming 85% of job price)
    const todayEarnings = todayJobs.reduce((sum, job) => sum + (job.price * 0.85), 0);
    
    // Calculate total hours worked today
    const todayHours = todayJobs.length * 0.5;

    // Get weekly stats
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const weeklyJobs = await Job.find({
      providerId: provider._id,
      status: 'completed',
      completedAt: { $gte: weekAgo }
    });

    const weeklyEarnings = weeklyJobs.reduce((sum, job) => sum + (job.price * 0.85), 0);

    // Get monthly stats
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    
    const monthlyJobs = await Job.find({
      providerId: provider._id,
      status: 'completed',
      completedAt: { $gte: monthAgo }
    });

    const monthlyEarnings = monthlyJobs.reduce((sum, job) => sum + (job.price * 0.85), 0);

    // Get all-time stats
    const allJobs = await Job.find({
      providerId: provider._id,
      status: 'completed'
    });

    const totalEarnings = allJobs.reduce((sum, job) => sum + (job.price * 0.85), 0);

    const performanceData = {
      today: {
        earnings: todayEarnings,
        jobs: todayJobs.length,
        hours: todayHours
      },
      weekly: {
        earnings: weeklyEarnings,
        jobs: weeklyJobs.length
      },
      monthly: {
        earnings: monthlyEarnings,
        jobs: monthlyJobs.length
      },
      allTime: {
        earnings: totalEarnings,
        jobs: allJobs.length,
        rating: provider.rating || 0
      }
    };

    console.log('✅ Detailed performance data:', performanceData);

    res.json({
      success: true,
      data: performanceData
    });

  } catch (error) {
    console.error('Error getting provider detailed performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get provider detailed performance',
      error: error.message
    });
  }
};

// ==================== GET PROVIDER RECENT JOBS ====================
export const getProviderRecentJobs = async (req, res) => {
  try {
    const { providerId } = req.params; // firebaseUserId

    console.log(`📋 Getting recent jobs for provider: ${providerId}`);

    // Find provider by firebaseUserId
    const provider = await User.findOne({ firebaseUserId: providerId });
    
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Get recent jobs (last 5)
    const recentJobs = await Job.find({ 
      providerId: provider._id,
      status: { $in: ['completed', 'cancelled'] }
    })
    .sort({ completedAt: -1, cancelledAt: -1 })
    .limit(5)
    .select('title price status completedAt serviceType');

    const formattedJobs = recentJobs.map(job => ({
      id: job._id,
      title: job.title || job.serviceType || 'Service',
      price: `${(job.price || 0).toFixed(2)} BHD`,
      status: job.status === 'completed' ? 'Completed' : 'Cancelled',
      time: job.completedAt 
        ? formatTimeAgo(job.completedAt) 
        : job.cancelledAt 
          ? formatTimeAgo(job.cancelledAt) 
          : 'Recently'
    }));

    res.json({
      success: true,
      data: formattedJobs
    });

  } catch (error) {
    console.error('Error getting provider recent jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get provider recent jobs',
      error: error.message
    });
  }
};

// ==================== GET PROVIDER SERVICES ====================
export const getProviderServices = async (req, res) => {
  try {
    const { providerId } = req.params; // firebaseUserId

    console.log(`🔧 Getting services for provider: ${providerId}`);

    // Find provider by firebaseUserId
    const provider = await User.findOne({ firebaseUserId: providerId });
    
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Get live status for service categories
    const liveStatus = await ProviderLiveStatus.findOne({ 
      $or: [
        { firebaseUserId: providerId },
        { providerId: provider._id }
      ]
    });

    // Return services (from provider's metadata or live status)
    const services = liveStatus?.serviceCategories || [
      'Towing',
      'Fuel Delivery',
      'Battery Replacement',
      'Tire Replacement'
    ];

    res.json({
      success: true,
      data: services
    });

  } catch (error) {
    console.error('Error getting provider services:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get provider services',
      error: error.message
    });
  }
};

// ==================== UPDATE PROVIDER SERVICES ====================
export const updateProviderServices = async (req, res) => {
  try {
    const { providerId } = req.params; // firebaseUserId
    const { services } = req.body;

    console.log(`🔧 Updating services for provider: ${providerId}`, services);

    // Find provider by firebaseUserId
    const provider = await User.findOne({ firebaseUserId: providerId });
    
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Update live status with service categories
    const liveStatus = await ProviderLiveStatus.findOneAndUpdate(
      { $or: [{ firebaseUserId: providerId }, { providerId: provider._id }] },
      {
        $set: {
          providerId: provider._id,
          firebaseUserId: providerId,
          serviceCategories: services,
          lastSeen: new Date()
        }
      },
      { 
        upsert: true,
        new: true
      }
    );

    res.json({
      success: true,
      data: liveStatus.serviceCategories
    });

  } catch (error) {
    console.error('Error updating provider services:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update provider services',
      error: error.message
    });
  }
};

// ==================== GET NEARBY PROVIDERS ====================
export const getNearbyProviders = async (req, res) => {
  try {
    const { lat, lng, radius = 10, serviceType } = req.query;

    console.log(`📍 Finding nearby providers near [${lat}, ${lng}] within ${radius}km`);

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    // Parse coordinates
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const maxDistance = parseFloat(radius) * 1000; // Convert km to meters

    // Build query
    const query = {
      isOnline: true,
      isAvailable: true,
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: maxDistance
        }
      }
    };

    // Add service type filter if provided
    if (serviceType) {
      query.serviceCategories = serviceType;
    }

    // Find nearby providers
    const providers = await ProviderLiveStatus.find(query)
      .populate('providerId', 'fullName rating profileImage phoneNumber')
      .limit(20);

    console.log(`✅ Found ${providers.length} nearby providers`);

    // Format response
    const formattedProviders = providers.map(p => ({
      id: p.providerId?._id,
      firebaseUserId: p.firebaseUserId,
      name: p.providerId?.fullName || 'Provider',
      rating: p.providerId?.rating || 0,
      profileImage: p.providerId?.profileImage,
      location: {
        latitude: p.currentLocation.coordinates[1],
        longitude: p.currentLocation.coordinates[0],
        address: p.currentLocation.address,
        isManual: p.currentLocation.isManual,
        lastUpdated: p.currentLocation.lastUpdated
      },
      distance: calculateDistance(
        latitude,
        longitude,
        p.currentLocation.coordinates[1],
        p.currentLocation.coordinates[0]
      ),
      services: p.serviceCategories || []
    }));

    res.json({
      success: true,
      data: formattedProviders
    });

  } catch (error) {
    console.error('Error finding nearby providers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find nearby providers',
      error: error.message
    });
  }
};

// ==================== GET PROVIDER PROFILE ====================
export const getProviderProfile = async (req, res) => {
  try {
    const { providerId } = req.params; // firebaseUserId or MongoDB _id

    console.log(`👤 Getting profile for provider: ${providerId}`);

    // Try to find by firebaseUserId first
    let provider = await User.findOne({ 
      $or: [
        { firebaseUserId: providerId },
        { _id: mongoose.Types.ObjectId.isValid(providerId) ? providerId : null }
      ],
      role: 'provider'
    }).select('-password');

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Get live status
    const liveStatus = await ProviderLiveStatus.findOne({ 
      $or: [
        { firebaseUserId: provider.firebaseUserId },
        { providerId: provider._id }
      ]
    });

    const profileData = {
      id: provider._id,
      firebaseUserId: provider.firebaseUserId,
      fullName: provider.fullName,
      email: provider.email,
      phoneNumber: provider.phoneNumber,
      profileImage: provider.profileImage,
      rating: provider.rating || 0,
      totalJobsCompleted: provider.totalJobsCompleted || 0,
      vehicleDetails: provider.vehicleDetails,
      services: liveStatus?.serviceCategories || [],
      isOnline: liveStatus?.isOnline || false,
      currentLocation: liveStatus?.currentLocation ? {
        latitude: liveStatus.currentLocation.coordinates[1],
        longitude: liveStatus.currentLocation.coordinates[0],
        address: liveStatus.currentLocation.address
      } : null,
      lastSeen: liveStatus?.lastSeen || provider.lastSeen
    };

    res.json({
      success: true,
      data: profileData
    });

  } catch (error) {
    console.error('Error getting provider profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get provider profile',
      error: error.message
    });
  }
};

// Helper function to calculate distance between two coordinates (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return distance < 1 
    ? `${Math.round(distance * 1000)} m` 
    : `${distance.toFixed(1)} km`;
};

const deg2rad = (deg) => {
  return deg * (Math.PI/180);
};

// Helper function to format time ago
const formatTimeAgo = (date) => {
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffMinutes < 120) return '1 hour ago';
  return `${Math.floor(diffMinutes / 60)} hours ago`;
};

export default {
  updateProviderLocation,
  getProviderStatus,
  updateProviderStatus,
  getProviderPerformance,
  getProviderPerformanceWithJobs,
  getProviderRecentJobs,
  getProviderServices,
  updateProviderServices,
  getNearbyProviders,
  getProviderProfile
};