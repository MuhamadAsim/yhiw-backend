// controllers/providerController.js
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import User from '../models/userModel.js';
import Job from '../models/jobModel.js';

// ==================== LOCATION & STATUS CONTROLLERS ====================

// Update provider online status
export const updateProviderStatus = async (req, res) => {
  try {
    const { providerId } = req.params;
    const { isOnline } = req.body;

    // Find provider by firebaseUserId
    const provider = await User.findOne({ 
      firebaseUserId: providerId,
      role: 'provider' 
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Find or create live status
    let liveStatus = await ProviderLiveStatus.findOne({ providerId: provider._id });

    if (!liveStatus) {
      liveStatus = new ProviderLiveStatus({
        providerId: provider._id,
        isOnline,
        lastSeen: new Date()
      });
    } else {
      liveStatus.isOnline = isOnline;
      liveStatus.lastSeen = new Date();
    }

    await liveStatus.save();

    res.status(200).json({
      success: true,
      data: {
        isOnline: liveStatus.isOnline,
        isAvailable: liveStatus.isAvailable,
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

// Update provider location
export const updateProviderLocation = async (req, res) => {
  try {
    const { providerId } = req.params;
    const { latitude, longitude, address, isManual, timestamp } = req.body;

    console.log(`📍 Location update received for provider ${providerId}:`, {
      latitude,
      longitude,
      address,
      isManual: isManual ? 'MANUAL' : 'AUTO',
      timestamp
    });

    // Find provider by firebaseUserId
    const provider = await User.findOne({ 
      firebaseUserId: providerId,
      role: 'provider' 
    });

    if (!provider) {
      console.error('❌ Provider not found:', providerId);
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Find or create live status
    let liveStatus = await ProviderLiveStatus.findOne({ providerId: provider._id });

    if (!liveStatus) {
      console.log('📝 Creating new live status record for provider:', provider._id);
      liveStatus = new ProviderLiveStatus({
        providerId: provider._id,
        currentLocation: {
          type: 'Point',
          coordinates: [longitude, latitude], // MongoDB expects [longitude, latitude]
          isManual: isManual || false,
          address: address || '',
          lastUpdated: new Date()
        },
        lastSeen: new Date(),
        isOnline: true
      });
    } else {
      // IMPORTANT: Check if existing location is manual and new update is NOT manual
      const existingIsManual = liveStatus.currentLocation?.isManual || false;
      
      console.log(`🔄 Existing location mode: ${existingIsManual ? 'MANUAL' : 'AUTO'}`);
      console.log(`🔄 New update mode: ${isManual ? 'MANUAL' : 'AUTO'}`);

      if (existingIsManual && !isManual) {
        // This is an auto update trying to override a manual location - PRESERVE MANUAL LOCATION
        console.log('✅ Preserving manual location, ignoring auto update');
        
        // Still update lastSeen to show provider is active
        liveStatus.lastSeen = new Date();
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
    }

    await liveStatus.save();
    console.log('✅ Location updated successfully');

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
    res.status(500).json({
      success: false,
      message: 'Failed to update provider location',
      error: error.message
    });
  }
};

// Get provider current status and location
export const getProviderStatus = async (req, res) => {
  try {
    const { providerId } = req.params;

    const provider = await User.findOne({ 
      firebaseUserId: providerId,
      role: 'provider' 
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    const liveStatus = await ProviderLiveStatus.findOne({ providerId: provider._id });

    if (!liveStatus) {
      return res.status(200).json({
        success: true,
        data: {
          isOnline: false,
          isAvailable: true,
          location: null,
          lastSeen: null
        }
      });
    }

    // Calculate if provider is actually online based on lastSeen
    const now = new Date();
    const lastSeen = new Date(liveStatus.lastSeen);
    const timeDiffInSeconds = Math.floor((now - lastSeen) / 1000);
    const isActuallyOnline = liveStatus.isOnline && timeDiffInSeconds <= 90;

    res.status(200).json({
      success: true,
      data: {
        isOnline: liveStatus.isOnline,
        isActuallyOnline,
        isAvailable: liveStatus.isAvailable,
        location: liveStatus.currentLocation ? {
          latitude: liveStatus.currentLocation.coordinates[1],
          longitude: liveStatus.currentLocation.coordinates[0],
          address: liveStatus.currentLocation.address || '',
          isManual: liveStatus.currentLocation.isManual || false
        } : null,
        lastSeen: liveStatus.lastSeen,
        timeSinceLastUpdate: timeDiffInSeconds,
        currentTaskId: liveStatus.currentTaskId
      }
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

// Get nearby available providers (for customers)
export const getNearbyProviders = async (req, res) => {
  try {
    const { latitude, longitude, maxDistance = 10000 } = req.query; // maxDistance in meters, default 10km

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    // Only get providers who are online AND have recent activity (last 90 seconds)
    const ninetySecondsAgo = new Date(Date.now() - 90 * 1000);

    const providers = await ProviderLiveStatus.find({
      isOnline: true,
      isAvailable: true,
      lastSeen: { $gte: ninetySecondsAgo },
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(maxDistance)
        }
      }
    }).populate('providerId', 'fullName rating totalJobsCompleted profileImage serviceType');

    const formattedProviders = providers.map(provider => {
      const providerData = provider.providerId;
      const distance = calculateDistance(
        parseFloat(latitude), 
        parseFloat(longitude), 
        provider.currentLocation.coordinates[1], 
        provider.currentLocation.coordinates[0]
      );

      return {
        providerId: providerData.firebaseUserId,
        name: providerData.fullName,
        rating: providerData.rating || 0,
        jobsCompleted: providerData.totalJobsCompleted || 0,
        serviceType: providerData.serviceType || [],
        profileImage: providerData.profileImage || null,
        location: {
          latitude: provider.currentLocation.coordinates[1],
          longitude: provider.currentLocation.coordinates[0],
          address: provider.currentLocation.address || '',
          isManual: provider.currentLocation.isManual || false
        },
        distance: distance, // in km
        lastSeen: provider.lastSeen
      };
    });

    // Sort by distance
    formattedProviders.sort((a, b) => a.distance - b.distance);

    res.status(200).json({
      success: true,
      data: formattedProviders
    });

  } catch (error) {
    console.error('Error getting nearby providers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get nearby providers',
      error: error.message
    });
  }
};

// ==================== PERFORMANCE CONTROLLERS ====================

// Get provider profile and stats (from User model)
export const getProviderProfile = async (req, res) => {
  try {
    const { providerId } = req.params;

    const provider = await User.findOne({ 
      firebaseUserId: providerId,
      role: 'provider' 
    }).select('-savedLocations -recentLocations'); // Exclude location arrays

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        firebaseUserId: provider.firebaseUserId,
        fullName: provider.fullName,
        email: provider.email,
        phoneNumber: provider.phoneNumber,
        profileImage: provider.profileImage,
        serviceType: provider.serviceType,
        description: provider.description,
        rating: provider.rating || 0,
        totalJobsCompleted: provider.totalJobsCompleted || 0,
        totalEarnings: provider.totalEarnings || 0,
        totalReviews: provider.totalReviews || 0,
        status: provider.status
      }
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

// Get provider performance data (from User model stats)
export const getProviderPerformance = async (req, res) => {
  try {
    const { providerId } = req.params;

    const provider = await User.findOne({ 
      firebaseUserId: providerId,
      role: 'provider' 
    }).select('rating totalJobsCompleted totalEarnings totalReviews');

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        earnings: provider.totalEarnings || 0,
        jobs: provider.totalJobsCompleted || 0,
        hours: 0, // Will be calculated from jobs when Job model is created
        rating: provider.rating || 0,
        reviews: provider.totalReviews || 0
      }
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

// Enhanced performance controller using Job model
export const getProviderPerformanceWithJobs = async (req, res) => {
  try {
    const { providerId } = req.params;
    const { period = 'today' } = req.query; // today, week, month, year

    const provider = await User.findOne({ 
      firebaseUserId: providerId,
      role: 'provider' 
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Calculate date range
    const now = new Date();
    let startDate = new Date();

    switch(period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setHours(0, 0, 0, 0);
    }

    // Get completed jobs in the period
    const jobs = await Job.find({
      providerId: provider._id,
      status: 'completed',
      completedAt: { $gte: startDate, $lte: now }
    });

    // Calculate metrics
    const earnings = jobs.reduce((sum, job) => sum + job.price, 0);
    const jobCount = jobs.length;
    const hours = jobs.reduce((sum, job) => sum + (job.actualDuration / 60), 0);
    
    // Calculate average rating from jobs with reviews
    const reviewedJobs = jobs.filter(job => job.customerRating);
    const avgRating = reviewedJobs.length > 0 
      ? reviewedJobs.reduce((sum, job) => sum + job.customerRating, 0) / reviewedJobs.length
      : provider.rating || 0;

    res.status(200).json({
      success: true,
      data: {
        earnings: Math.round(earnings * 100) / 100,
        jobs: jobCount,
        hours: Math.round(hours * 10) / 10,
        rating: Math.round(avgRating * 10) / 10,
        period,
        reviewedJobs: reviewedJobs.length
      }
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

// ==================== HELPER FUNCTIONS ====================

// Calculate distance between two coordinates in kilometers (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}