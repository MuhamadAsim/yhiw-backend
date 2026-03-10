// ==================== PROVIDER CONTROLLER ====================
import User from '../models/userModel.js';
import Job from '../models/jobModel.js';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import Notification from '../models/notificationModel.js';
import mongoose from 'mongoose';



// Google Maps API helper (already in your code, but included for reference)
const getGoogleMapsDistance = async (originLat, originLng, destLat, destLng) => {
  try {
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&key=${GOOGLE_MAPS_API_KEY}`;
    
    console.log(`🌐 Calling Google Maps API: ${url}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
      return {
        distance: data.rows[0].elements[0].distance.text,
        distanceValue: data.rows[0].elements[0].distance.value,
        duration: data.rows[0].elements[0].duration.text,
        durationValue: data.rows[0].elements[0].duration.value
      };
    }
    
    console.warn('⚠️ Google Maps API returned non-OK status:', data.status);
    return null;
  } catch (error) {
    console.error('❌ Google Maps API error:', error);
    return null;
  }
};

export const getAvailableJobs = async (req, res) => {
  try {
    const providerId = req.user.id;

    console.log(`📍 Getting available jobs for provider: ${providerId}`);

    // Get provider's current location for distance calculation
    const providerLocation = await ProviderLiveStatus.findOne({ providerId });
    
    if (!providerLocation?.currentLocation?.coordinates) {
      console.log('⚠️ Provider location not found, cannot calculate distances');
      // Still return jobs but without distance
      const query = {
        status: 'pending',
        createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) }
      };

      const jobs = await Notification.find(query)
        .select('-viewedBy')
        .sort({ createdAt: -1 })
        .limit(50);

      return res.json({
        success: true,
        count: jobs.length,
        jobs: jobs.map(job => ({
          ...job.toObject(),
          distance: 'Location unavailable',
          estimatedArrival: 'Unknown'
        }))
      });
    }

    const providerLat = providerLocation.currentLocation.coordinates[1];
    const providerLng = providerLocation.currentLocation.coordinates[0];

    const query = {
      status: 'pending',
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) }
    };

    const notifications = await Notification.find(query)
      .select('-viewedBy')
      .sort({ createdAt: -1 })
      .limit(50);

    console.log(`📦 Found ${notifications.length} pending jobs`);

    // Enhance each job with distance and ETA using Google Maps
    const jobsWithDistance = await Promise.all(notifications.map(async (notification) => {
      const jobObj = notification.toObject();
      
      // Default values
      jobObj.distance = 'Calculating...';
      jobObj.estimatedArrival = 'Calculating...';
      
      // Calculate distance if we have pickup coordinates
      if (notification.pickup?.coordinates) {
        const pickupLat = notification.pickup.coordinates.lat;
        const pickupLng = notification.pickup.coordinates.lng;
        
        try {
          // Get real distance from Google Maps
          const mapsData = await getGoogleMapsDistance(
            providerLat, providerLng,
            pickupLat, pickupLng
          );
          
          if (mapsData) {
            jobObj.distance = mapsData.distance; // e.g., "3.2 km"
            jobObj.estimatedArrival = mapsData.duration; // e.g., "12 mins"
            jobObj.distanceValue = mapsData.distanceValue; // in meters
            jobObj.durationValue = mapsData.durationValue; // in seconds
            console.log(`📍 Job ${notification.bookingId}: Distance ${jobObj.distance}, ETA ${jobObj.estimatedArrival}`);
          } else {
            // Fallback to simple calculation if Google Maps fails
            const simpleDistance = calculateSimpleDistance(
              providerLat, providerLng,
              pickupLat, pickupLng
            );
            jobObj.distance = `${simpleDistance.toFixed(1)} km`;
            jobObj.estimatedArrival = `${Math.ceil(simpleDistance * 12)} min`;
            console.log(`⚠️ Google Maps failed for ${notification.bookingId}, using fallback: ${jobObj.distance}`);
          }
        } catch (mapsError) {
          console.error(`❌ Error calculating distance for job ${notification.bookingId}:`, mapsError);
          // Fallback
          const simpleDistance = calculateSimpleDistance(
            providerLat, providerLng,
            pickupLat, pickupLng
          );
          jobObj.distance = `${simpleDistance.toFixed(1)} km`;
          jobObj.estimatedArrival = `${Math.ceil(simpleDistance * 12)} min`;
        }
      } else {
        console.log(`⚠️ Job ${notification.bookingId} has no pickup coordinates`);
        jobObj.distance = 'Location unavailable';
        jobObj.estimatedArrival = 'Unknown';
      }
      
      return jobObj;
    }));

    // Mark jobs as viewed
    if (notifications.length > 0) {
      const jobIds = notifications.map(job => job._id);
      await Notification.updateMany(
        { _id: { $in: jobIds } },
        { $addToSet: { viewedBy: { providerId, viewedAt: new Date() } } }
      );
      console.log(`👁️ Marked ${notifications.length} jobs as viewed by provider ${providerId}`);
    }

    console.log(`✅ Returning ${jobsWithDistance.length} jobs with distances`);

    res.json({
      success: true,
      count: jobsWithDistance.length,
      jobs: jobsWithDistance
    });

  } catch (error) {
    console.error('❌ Get available jobs error:', error);
    res.status(500).json({ error: error.message });
  }
};


// Helper function for simple distance calculation (fallback)
function calculateSimpleDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}




export const acceptJob = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { bookingId } = req.params;
    const providerId = req.user.id; // This comes from auth middleware - GOOD!

    console.log(`\n🔵 ===== ACCEPT JOB STARTED =====`);
    console.log(`📦 Booking ID: ${bookingId}`);
    console.log(`👤 Provider ID: ${providerId}`);

    const notification = await Notification.findOne({
      bookingId,
      status: 'pending'
    }).session(session);

    if (!notification) {
      console.log(`❌ Job not available or expired: ${bookingId}`);
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        error: 'Job not available',
        message: 'This job has already been taken or expired'
      });
    }

    console.log(`✅ Notification found:`);
    console.log(`  - Customer ID: ${notification.customerId}`);
    console.log(`  - Service: ${notification.serviceName}`);
    console.log(`  - Customer email already in notification:`, notification.customer?.email);

    const provider = await User.findById(providerId).session(session);
    if (!provider) {
      console.log(`❌ Provider not found: ${providerId}`);
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Provider not found' });
    }

    console.log(`✅ Provider found: ${provider.fullName || providerId}`);

    // ✅ FIXED: Map vehicle correctly from Notification to Job
    const vehicleData = {
      type: notification.vehicle?.vehicleType || '',
      makeModel: notification.vehicle?.makeModel || '',
      year: notification.vehicle?.year || '',
      color: notification.vehicle?.color || '',
      licensePlate: notification.vehicle?.licensePlate || ''
    };

    console.log(`\n🔄 Vehicle data mapping:`);
    console.log(`  From Notification:`, JSON.stringify(notification.vehicle, null, 2));
    console.log(`  To Job:`, JSON.stringify(vehicleData, null, 2));

    // ✅ FIXED: Get email from notification, not from request body
    const customerEmail = notification.customer?.email || '';

    const job = new Job({
      bookingId: notification.bookingId,
      customerId: notification.customerId,
      providerId: providerId,
      bookingData: {
        serviceId: notification.serviceId,
        serviceName: notification.serviceName,
        servicePrice: notification.servicePrice,
        serviceCategory: notification.serviceCategory,
        pickup: notification.pickup,
        dropoff: notification.dropoff,
        
        vehicle: vehicleData,
        
        customer: {
          name: notification.customer.name,
          phone: notification.customer.phone,
          email: customerEmail, // ← FIXED: Use email from notification
        },
        urgency: notification.urgency,
        issues: notification.issues,
        description: notification.description,
        payment: notification.payment,
        isCarRental: notification.isCarRental,
        isFuelDelivery: notification.isFuelDelivery,
        isSpareParts: notification.isSpareParts,
        fuelType: notification.fuelType,
        partDescription: notification.partDescription,
        hasInsurance: notification.hasInsurance
      },
      status: 'accepted',
      acceptedAt: new Date()
    });

    await job.save({ session });
    console.log(`✅ Job created in database: ${job._id}`);

    await ProviderLiveStatus.findOneAndUpdate(
      { providerId: providerId },
      {
        currentBookingId: bookingId,
        isAvailable: false,
        lastSeen: new Date()
      },
      { session, upsert: true }
    );
    console.log(`✅ Provider status updated - now unavailable`);

    await Notification.deleteOne({ _id: notification._id }).session(session);
    console.log(`✅ Notification deleted`);

    await session.commitTransaction();
    session.endSession();
    console.log(`✅ Transaction committed successfully`);

    const customer = await User.findById(notification.customerId);
    
    // Get provider location for ETA calculation
    const providerLocation = await ProviderLiveStatus.findOne({ providerId });
    let estimatedArrival = '5-10 minutes';
    
    if (providerLocation?.currentLocation?.coordinates && notification.pickup?.coordinates) {
      const providerLat = providerLocation.currentLocation.coordinates[1];
      const providerLng = providerLocation.currentLocation.coordinates[0];
      const pickupLat = notification.pickup.coordinates.lat;
      const pickupLng = notification.pickup.coordinates.lng;
      
      const mapsData = await getGoogleMapsDistance(
        providerLat, providerLng,
        pickupLat, pickupLng
      );
      
      if (mapsData) {
        estimatedArrival = mapsData.duration;
        console.log(`📍 Google Maps ETA: ${estimatedArrival}`);
      }
    }

    console.log(`\n📤 SENDING RESPONSE:`);
    console.log(`  success: true`);
    console.log(`  bookingId: ${job.bookingId}`);
    console.log(`🔵 ===== ACCEPT JOB COMPLETED =====\n`);

    res.json({
      success: true,
      message: 'Job accepted successfully',
      job: {
        bookingId: job.bookingId,
        customer: {
          name: customer?.fullName || notification.customer.name,
          phone: customer?.phoneNumber || notification.customer.phone,
          location: notification.pickup.address
        },
        estimatedArrival
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('\n❌❌❌ ACCEPT JOB ERROR ❌❌❌');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    console.log('🔵 ===== ACCEPT JOB FAILED =====\n');
    res.status(500).json({ error: error.message });
  }
};

export const updateProviderStatus = async (req, res) => {
  try {
    const { firebaseUserId } = req.params;
    const { isOnline } = req.body;
    const providerId = req.user.id;

    const liveStatus = await ProviderLiveStatus.findOneAndUpdate(
      { providerId },
      {
        firebaseUserId,
        isOnline,
        lastSeen: new Date(),
        ...(isOnline ? {} : { currentBookingId: null })
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      data: {
        isOnline: liveStatus.isOnline,
        lastSeen: liveStatus.lastSeen
      }
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateProviderLocation = async (req, res) => {
  try {
    const { firebaseUserId } = req.params;
    const { latitude, longitude, address, isManual, timestamp } = req.body;
    const providerId = req.user.id;

    const liveStatus = await ProviderLiveStatus.findOneAndUpdate(
      { providerId },
      {
        firebaseUserId,
        currentLocation: {
          type: 'Point',
          coordinates: [longitude, latitude],
          address,
          isManual,
          lastUpdated: new Date(timestamp)
        },
        lastSeen: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Location updated successfully'
    });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getProviderStatus = async (req, res) => {
  try {
    const { firebaseUserId } = req.params;
    const providerId = req.user.id;

    const liveStatus = await ProviderLiveStatus.findOne({ providerId });

    if (!liveStatus) {
      return res.json({
        success: true,
        data: {
          isOnline: false,
          isAvailable: true,
          currentLocation: null,
          firebaseUserId
        }
      });
    }

    res.json({
      success: true,
      data: {
        isOnline: liveStatus.isOnline,
        isAvailable: liveStatus.isAvailable,
        currentLocation: liveStatus.currentLocation,
        lastSeen: liveStatus.lastSeen,
        currentBookingId: liveStatus.currentBookingId,
        firebaseUserId: liveStatus.firebaseUserId
      }
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: error.message });
  }
};












export const getProviderInfo = async (req, res) => {
  try {
    const { firebaseUserId } = req.params;
    const providerId = req.user.id;

    // ===== GET PROVIDER PROFILE DATA =====
    const provider = await User.findById(providerId);

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // ===== CALCULATE TOTAL JOBS (ALL TIME) =====
    const totalJobs = await Job.countDocuments({
      providerId,
      status: { $in: ['completed', 'completed_confirmed'] }
    });

    // ===== CALCULATE AVERAGE RATING =====
    const ratingResult = await Job.aggregate([
      {
        $match: {
          providerId,
          status: { $in: ['completed', 'completed_confirmed'] },
          'customerRating.rating': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$customerRating.rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    const averageRating = ratingResult.length > 0 
      ? Math.round(ratingResult[0].averageRating * 10) / 10 
      : provider.rating || 4.8;

    const totalReviews = ratingResult.length > 0 
      ? ratingResult[0].totalReviews 
      : provider.totalReviews || 0;

    // ===== GET TODAY'S PERFORMANCE DATA =====
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayJobs = await Job.find({
      providerId,
      status: { $in: ['completed', 'completed_confirmed'] },
      completedAt: { $gte: today, $lt: tomorrow }
    });

    const todayEarnings = todayJobs.reduce((sum, job) => 
      sum + (job.bookingData?.payment?.totalAmount || 0), 0
    );

    const todayHours = todayJobs.reduce((sum, job) => {
      if (job.completedAt && job.acceptedAt) {
        const duration = (new Date(job.completedAt) - new Date(job.acceptedAt)) / (1000 * 60 * 60);
        return sum + duration;
      }
      // If no timing data, assume 1 hour per job
      return sum + 1;
    }, 0);

    // ===== GET RECENT JOBS =====
    const recentJobs = await Job.find({
      providerId,
      status: { $in: ['completed', 'completed_confirmed'] }
    })
    .sort({ completedAt: -1 })
    .limit(5)
    .lean();

    const formattedRecentJobs = recentJobs.map(job => {
      const completedDate = job.completedAt || job.updatedAt;
      const now = new Date();
      const diffMs = now - new Date(completedDate);
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      let timeAgo;
      if (diffMins < 60) {
        timeAgo = `${diffMins} min ago`;
      } else if (diffHours < 24) {
        timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      } else {
        timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      }

      return {
        id: job._id,
        title: job.bookingData?.serviceName || 'Service',
        time: timeAgo,
        price: `${job.bookingData?.payment?.totalAmount || 0} BHD`,
        status: 'Completed'
      };
    });

    // ===== RETURN COMBINED RESPONSE =====
    res.json({
      success: true,
      data: {
        // Profile data for header
        profile: {
          name: provider.fullName,
          providerId: provider._id.toString().slice(-6), // Format like PRV-001234
          email: provider.email,//
          phoneNumber: provider.phoneNumber,
          rating: averageRating,
          totalJobs: totalJobs,
          isVerified: provider.status === 'active',
          memberSince: provider.createdAt,
          serviceType: provider.serviceType || [],
          description: provider.description || '',
        },
        // Today's performance data
        performance: {
          earnings: Number(todayEarnings.toFixed(2)),
          jobs: todayJobs.length,
          hours: Number(todayHours.toFixed(1)),
          rating: averageRating,
        },
        // Recent jobs
        recentJobs: formattedRecentJobs
      }
    });

  } catch (error) {
    console.error('Get performance error:', error);
    
    // Return default values with proper structure
    res.json({
      success: true,
      data: {
        profile: {
          name: 'Provider',
          providerId: '001234',
          email: '',
          phoneNumber: '',
          rating: 4.8,
          totalJobs: 0,
          isVerified: true,
          memberSince: new Date(),
          serviceType: [],
          description: '',
        },
        performance: {
          earnings: 0,
          jobs: 0,
          hours: 0,
          rating: 4.8,
        },
        recentJobs: []
      }
    });
  }
};












export const getRecentJobs = async (req, res) => {
  try {
    const { firebaseUserId } = req.params;
    const providerId = req.user.id;

    const recentJobs = await Job.find({ providerId })
      .sort({ acceptedAt: -1 })
      .limit(5)
      .select('bookingData status acceptedAt completedAt');

    const formatRelativeTime = (date) => {
      const now = new Date();
      const diffMs = now - new Date(date);
      const diffMins = Math.floor(diffMs / (1000 * 60));
      
      if (diffMins < 60) return `${diffMins} min ago`;
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
      return `${Math.floor(diffMins / 1440)} days ago`;
    };

    const formattedJobs = recentJobs.map(job => ({
      id: job._id,
      title: job.bookingData?.serviceName || 'Service',
      time: formatRelativeTime(job.acceptedAt),
      price: `${job.bookingData?.payment?.totalAmount || 0} BHD`,
      status: job.status === 'completed' ? 'COMPLETED' : 'IN PROGRESS'
    }));

    res.json({
      success: true,
      data: formattedJobs
    });
  } catch (error) {
    console.error('Get recent jobs error:', error);
    res.json({
      success: true,
      data: []
    });
  }
};

export const providerCancelJob = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;
    const { reason } = req.body;

    const job = await Job.findOne({ bookingId, providerId });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel completed job' });
    }

    job.status = 'cancelled';
    job.cancelledAt = new Date();
    job.cancelledBy = 'provider';
    await job.save();

    await ProviderLiveStatus.findOneAndUpdate(
      { providerId },
      {
        isAvailable: true,
        currentBookingId: null
      }
    );

    res.json({ success: true, message: 'Job cancelled successfully' });
  } catch (error) {
    console.error('Provider cancel error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ==================== SERVICE IN PROGRESS CONTROLLERS ====================
export const getActiveJob = async (req, res) => {
  try {
    const providerId = req.user.id;
    const { bookingId } = req.params;

    const job = await Job.findOne({ 
      bookingId, 
      providerId,
      status: { $in: ['accepted', 'in_progress'] }
    }).populate('customerId', 'fullName phoneNumber');

    if (!job) {
      return res.status(404).json({ 
        error: 'Active job not found' 
      });
    }

    // Get real ETA if still en route
    let remainingEta = null;
    if (job.status === 'accepted') {
      const providerLocation = await ProviderLiveStatus.findOne({ providerId });
      
      if (providerLocation?.currentLocation?.coordinates && job.bookingData?.pickup?.coordinates) {
        const providerLat = providerLocation.currentLocation.coordinates[1];
        const providerLng = providerLocation.currentLocation.coordinates[0];
        const pickupLat = job.bookingData.pickup.coordinates.lat;
        const pickupLng = job.bookingData.pickup.coordinates.lng;
        
        const mapsData = await getGoogleMapsDistance(
          providerLat, providerLng,
          pickupLat, pickupLng
        );
        
        if (mapsData) {
          remainingEta = mapsData.duration;
        }
      }
    }

    const jobDetails = {
      bookingId: job.bookingId,
      serviceType: job.bookingData?.serviceName || 'Towing Service',
      vehicleType: job.bookingData?.vehicle?.type || 'Sedan',
      licensePlate: job.bookingData?.vehicle?.licensePlate || 'ABC 1234',
      vehicleModel: `${job.bookingData?.vehicle?.makeModel || 'Toyota Camry'} ${job.bookingData?.vehicle?.year || '2020'}`,
      customer: {
        name: job.customerId?.fullName || job.bookingData?.customer?.name || 'Mohammed A.',
        phone: job.customerId?.phoneNumber || job.bookingData?.customer?.phone || '+973 3XXX XXXX',
      },
      estimatedEarnings: job.bookingData?.payment?.totalAmount || 81,
      status: job.status,
      startedAt: job.startedAt,
      remainingEta: remainingEta,
      timeTracking: job.timeTracking || { totalSeconds: 0, isPaused: false },
      photos: job.photos || [],
      issues: job.issues || [],
      checklist: [
        'Inspect vehicle condition',
        'Secure vehicle on flatbed',
        'Document pre-service photos',
        'Check for personal items',
        'Verify drop-off location',
      ]
    };

    res.json({ 
      success: true, 
      job: jobDetails 
    });

  } catch (error) {
    console.error('Get active job error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateJobStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status, action, timeData } = req.body;
    const providerId = req.user.id;

    const updateData = {};
    
    if (status === 'in_progress' && action === 'start') {
      updateData.startedAt = new Date();
      updateData.status = 'in_progress';
      updateData['timeTracking'] = { totalSeconds: 0, isPaused: false };
    } else if (status === 'completed') {
      updateData.completedAt = new Date();
      updateData.status = 'completed';
      
      await ProviderLiveStatus.findOneAndUpdate(
        { providerId },
        { isAvailable: true, currentBookingId: null }
      );
    } else if (action === 'pause') {
      updateData['timeTracking.isPaused'] = true;
      updateData['timeTracking.pausedAt'] = new Date();
    } else if (action === 'resume') {
      updateData['timeTracking.isPaused'] = false;
    } else if (action === 'add_time' && timeData) {
      updateData.$push = { 
        'timeTracking.timeExtensions': {
          minutes: timeData.minutes,
          reason: timeData.reason,
          requestedAt: new Date()
        }
      };
    }

    const job = await Job.findOneAndUpdate(
      { bookingId, providerId },
      updateData,
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ 
      success: true, 
      message: `Job updated successfully`,
      status: job.status,
      timeTracking: job.timeTracking
    });

  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const uploadServicePhoto = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;
    const { photoType, description } = req.body;

    const job = await Job.findOne({ bookingId, providerId });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.photos) job.photos = [];
    
    job.photos.push({
      type: photoType || 'during-service',
      url: req.file?.path || 'temp-photo-url',
      description,
      uploadedAt: new Date()
    });

    await job.save();

    res.json({ 
      success: true, 
      message: 'Photo uploaded successfully',
      photos: job.photos
    });

  } catch (error) {
    console.error('Upload photo error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const reportServiceIssue = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;
    const { issueType, description, severity } = req.body;

    const job = await Job.findOne({ bookingId, providerId });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.issues) job.issues = [];
    
    const newIssue = {
      type: issueType,
      description,
      severity: severity || 'medium',
      reportedBy: 'provider',
      reportedAt: new Date(),
      status: 'open'
    };

    job.issues.push(newIssue);
    await job.save();

    res.json({ 
      success: true, 
      message: 'Issue reported successfully',
      issue: newIssue
    });

  } catch (error) {
    console.error('Report issue error:', error);
    res.status(500).json({ error: error.message });
  }
};






export const completeService = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;
    const { 
      completionNotes, 
      checklistCompleted,
      issuesFound 
    } = req.body;

    const job = await Job.findOne({ bookingId, providerId });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    job.status = 'completed';
    job.completedAt = new Date();
    job.completionDetails = {
      notes: completionNotes,
      checklistCompleted: checklistCompleted || [],
      issuesFound: issuesFound || [],
      completedBy: providerId
    };

    await job.save();

    const providerStatus = await ProviderLiveStatus.findOneAndUpdate(
      { providerId },
      { 
        isAvailable: true, 
        currentBookingId: null
      },
      { new: true }
    );

    const totalJobsCompleted = (providerStatus?.totalJobsCompleted || 0) + 1;
    
    await ProviderLiveStatus.findOneAndUpdate(
      { providerId },
      { totalJobsCompleted }
    );

    res.json({ 
      success: true, 
      message: 'Service completed successfully',
      earnings: job.bookingData?.payment?.totalAmount,
      totalJobsCompleted
    });

  } catch (error) {
    console.error('Complete service error:', error);
    res.status(500).json({ error: error.message });
  }
};











// GET /api/provider/job/:bookingId/active
export const getProviderActiveJob = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;

    console.log(`\n🔵 ===== PROVIDER FETCHING ACTIVE JOB =====`);
    console.log(`📋 Booking ID: ${bookingId}`);
    console.log(`👤 Provider ID: ${providerId}`);

    // Find the job with proper population
    const job = await Job.findOne({ 
      bookingId, 
      providerId,
      status: { $in: ['accepted', 'in_progress'] }
    }).populate('customerId', 'fullName phoneNumber rating');

    if (!job) {
      console.log(`❌ Active job not found for provider`);
      return res.status(404).json({
        success: false,
        message: 'Active job not found'
      });
    }

    console.log(`✅ Job found - Status: ${job.status}`);

    // Get customer details
    const customer = job.customerId || {};

    // ========== LIVE GOOGLE MAPS CALCULATION ==========
    let distance = 'Calculating...';
    let eta = 'Calculating...';
    let routePolyline = null;
    let usingRealTimeETA = false;
    let mapsError = null;

    // Get provider's current location
    const providerStatus = await ProviderLiveStatus.findOne({ providerId });
    
    // Check if we have all required coordinates
    if (providerStatus?.currentLocation?.coordinates && 
        job.bookingData?.pickup?.coordinates?.lat && 
        job.bookingData?.pickup?.coordinates?.lng) {
      
      const providerLat = providerStatus.currentLocation.coordinates[1];
      const providerLng = providerStatus.currentLocation.coordinates[0];
      const pickupLat = job.bookingData.pickup.coordinates.lat;
      const pickupLng = job.bookingData.pickup.coordinates.lng;
      
      // Validate coordinates
      if (!isNaN(providerLat) && !isNaN(providerLng) && 
          !isNaN(pickupLat) && !isNaN(pickupLng)) {
        
        console.log(`📍 Calculating route from (${providerLat},${providerLng}) to (${pickupLat},${pickupLng})`);
        
        try {
          // Use Google Maps helper to get fresh data
          const mapsData = await getGoogleMapsDistance(
            providerLat, providerLng,
            pickupLat, pickupLng
          );
          
          if (mapsData) {
            distance = mapsData.distance;      // e.g., "5.2 km"
            eta = mapsData.duration;           // e.g., "12 mins"
            routePolyline = mapsData.polyline; // For drawing route on map
            usingRealTimeETA = true;
            console.log(`✅ Real-time ETA: ${eta}, Distance: ${distance}`);
          } else {
            mapsError = 'Google Maps returned no data';
            console.log(`⚠️ ${mapsError}`);
          }
        } catch (googleError) {
          mapsError = googleError.message;
          console.error(`❌ Google Maps API error:`, googleError.message);
          
          // Fallback to simple calculation only if Google completely fails
          const simpleDistance = calculateSimpleDistance(
            providerLat, providerLng,
            pickupLat, pickupLng
          );
          distance = `${simpleDistance.toFixed(1)} km (approx)`;
          eta = `${Math.ceil(simpleDistance * 12)} min (approx)`;
          console.log(`⚠️ Using fallback calculation: ${distance}, ${eta}`);
        }
      } else {
        mapsError = 'Invalid coordinates detected';
        console.log(`⚠️ ${mapsError}`);
      }
    } else {
      mapsError = 'Missing location data - provider or pickup coordinates not available';
      console.log(`⚠️ ${mapsError}`);
    }

    // Prepare response with LIVE Google Maps data
    const response = {
      success: true,
      status: job.status,
      usingRealTimeETA,
      mapsError, // Include for debugging (remove in production if needed)
      job: {
        bookingId: job.bookingId,
        customerName: customer.fullName || job.bookingData?.customer?.name || 'Customer',
        customerPhone: customer.phoneNumber || job.bookingData?.customer?.phone || '',
        customerRating: customer.rating || 4.5,
        
        // Location details
        pickupLocation: job.bookingData?.pickup?.address || 'Pickup location',
        pickupLat: job.bookingData?.pickup?.coordinates?.lat || null,
        pickupLng: job.bookingData?.pickup?.coordinates?.lng || null,
        dropoffLocation: job.bookingData?.dropoff?.address || null,
        dropoffLat: job.bookingData?.dropoff?.coordinates?.lat || null,
        dropoffLng: job.bookingData?.dropoff?.coordinates?.lng || null,
        
        // LIVE Google Maps data (fresh every request)
        distance: distance,  // Real distance from Google Maps
        eta: eta,            // Real ETA with traffic from Google Maps
        routePolyline: routePolyline, // For drawing route on map
        
        // Additional info
        navigationTips: job.bookingData?.description || 
                       job.bookingData?.specialInstructions || 
                       'Call customer upon arrival.',
        serviceType: job.bookingData?.serviceType || 'Towing Service',
        vehicleType: job.bookingData?.vehicleType || 'Sedan',
        estimatedEarnings: job.estimatedEarnings || job.bookingData?.estimatedPrice || '0',
        createdAt: job.createdAt
      }
    };

    console.log(`✅ Returning active job with LIVE Google Maps data`);
    return res.json(response);

  } catch (error) {
    console.error('❌ Get provider active job error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};




/**
 * Cancel job (called by provider)
 * Endpoint: POST /api/provider/:bookingId/cancel
 */
export const cancelJobByProvider = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason, cancellationDetails } = req.body;
    const providerId = req.user.userId; // Assuming auth middleware sets req.user

    // Find the job
    const job = await Job.findOne({ bookingId });
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Verify this provider is assigned to the job
    if (job.providerId.toString() !== providerId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to cancel this job'
      });
    }

    // Check if job can be cancelled (only accepted or in_progress)
    if (!['accepted', 'in_progress'].includes(job.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel job with status: ${job.status}`
      });
    }

    // Update job status to cancelled
    job.status = 'cancelled';
    job.cancelledAt = new Date();
    job.cancelledBy = 'provider';

    // Save cancellation reason if provided
    if (reason) {
      job.cancellationReason = reason;
    }

    // Add to issues if there's a specific issue
    if (cancellationDetails?.issue) {
      job.issues.push({
        type: 'cancellation',
        description: cancellationDetails.issue,
        severity: cancellationDetails.severity || 'medium',
        reportedAt: new Date(),
        status: 'open'
      });
    }

    await job.save();

    // TODO: Notify customer via push notification/socket
    // notifyCustomer(job.customerId, 'PROVIDER_CANCELLED', { bookingId, reason });

    return res.status(200).json({
      success: true,
      message: 'Job cancelled successfully',
      data: {
        bookingId: job.bookingId,
        status: job.status,
        cancelledAt: job.cancelledAt,
        cancelledBy: job.cancelledBy
      }
    });

  } catch (error) {
    console.error('Error cancelling job by provider:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel job',
      error: error.message
    });
  }
};





/**
 * Get job status for provider
 * Endpoint: GET /api/provider/:bookingId/status
 */
export const getJobStatusForProvider = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.userId;

    // Find the job and select only necessary fields for status check
    const job = await Job.findOne({ 
      bookingId,
      providerId // Ensure this provider is assigned
    }).select({
      bookingId: 1,
      status: 1,
      cancelledAt: 1,
      cancelledBy: 1,
      startedAt: 1,
      completedAt: 1,
      'issues': { $slice: -1 }, // Only get latest issue if any
      'timeTracking.isPaused': 1
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found or not assigned to you'
      });
    }

    // Prepare response with relevant status info
    const response = {
      success: true,
      bookingId: job.bookingId,
      status: job.status,
      timestamp: new Date().toISOString()
    };

    // Add cancellation info if job is cancelled
    if (job.status === 'cancelled') {
      response.cancellationInfo = {
        cancelledAt: job.cancelledAt,
        cancelledBy: job.cancelledBy,
        reason: job.cancellationReason || 'No reason provided'
      };
    }

    // Add in-progress info if applicable
    if (job.status === 'in_progress') {
      response.progressInfo = {
        startedAt: job.startedAt,
        isPaused: job.timeTracking?.isPaused || false
      };
    }

    // Add completed info if applicable
    if (job.status === 'completed') {
      response.completionInfo = {
        completedAt: job.completedAt
      };
    }

    // If there's a recent issue, include it
    if (job.issues && job.issues.length > 0) {
      const latestIssue = job.issues[job.issues.length - 1];
      if (latestIssue && latestIssue.reportedAt) {
        const hoursSinceIssue = (Date.now() - new Date(latestIssue.reportedAt).getTime()) / (1000 * 60 * 60);
        // Only include issues from last 24 hours
        if (hoursSinceIssue < 24) {
          response.recentIssue = {
            type: latestIssue.type,
            description: latestIssue.description,
            severity: latestIssue.severity,
            reportedAt: latestIssue.reportedAt
          };
        }
      }
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error getting job status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get job status',
      error: error.message
    });
  }
};








// POST /api/provider/:bookingId/route
export const getProviderRoute = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;
    const { originLat, originLng, destLat, destLng } = req.body;

    console.log(`📍 Calculating route for provider ${providerId}, booking ${bookingId}`);
    console.log(`📍 From: (${originLat}, ${originLng}) To: (${destLat}, ${destLng})`);

    // Validate coordinates
    if (!originLat || !originLng || !destLat || !destLng) {
      return res.status(400).json({
        success: false,
        message: 'Missing coordinates'
      });
    }

    // Call Google Maps Directions API
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&key=${process.env.GOOGLE_MAPS_API_KEY}&mode=driving&alternatives=false`;
    
    const response = await axios.get(url);
    
    if (response.data.status === 'OK' && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      const leg = route.legs[0];
      
      res.json({
        success: true,
        route: {
          polyline: route.overview_polyline.points,
          distance: leg.distance.text,
          eta: leg.duration.text,
          distanceValue: leg.distance.value,
          etaValue: leg.duration.value,
          startAddress: leg.start_address,
          endAddress: leg.end_address
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'No route found',
        googleStatus: response.data.status
      });
    }
  } catch (error) {
    console.error('Route calculation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};