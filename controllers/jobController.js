import Job from '../models/jobModel.js';
import User from '../models/userModel.js';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import mongoose from 'mongoose';

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
  return R * c;
}

function calculateETA(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 'Calculating...';
  
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  // Average speed: 30 km/h in city
  const avgSpeed = 30; // km/h
  const timeInHours = distance / avgSpeed;
  const timeInMinutes = Math.ceil(timeInHours * 60);
  
  if (timeInMinutes < 1) return '1 min';
  if (timeInMinutes === 1) return '1 min';
  if (timeInMinutes < 60) return `${timeInMinutes} min`;
  const hours = Math.floor(timeInMinutes / 60);
  const mins = timeInMinutes % 60;
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

// Generate job number
const generateJobNumber = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `JOB-${year}${month}${day}-${random}`;
};

// Helper function to generate booking ID
const generateBookingId = () => {
  return `BK-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
};


// Helper function for time ago
const getTimeAgo = (date) => {
  const now = new Date();
  const diffMinutes = Math.floor((now - new Date(date)) / 60000);
  
  if (diffMinutes < 60) return `${diffMinutes} MINUTES AGO`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} HOURS AGO`;
  return `${Math.floor(diffMinutes / 1440)} DAYS AGO`;
};

// ==================== TRACKING ENDPOINT ====================

// Get job with provider location for tracking
export const getJobTrackingInfo = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    console.log('📍 TRACKING INFO REQUESTED for job:', jobId);

    const job = await Job.findById(jobId)
      .populate('providerId', 'fullName phoneNumber rating profileImage firebaseUserId vehicleDetails')
      .populate('customerId', 'fullName phoneNumber')
      .lean();

    if (!job) {
      return res.status(404).json({ 
        success: false, 
        message: 'Job not found' 
      });
    }

    // Verify user has access to this job
    const isCustomer = job.customerId._id.toString() === userId.toString();
    const isProvider = job.providerId && job.providerId._id.toString() === userId.toString();
    
    if (!isCustomer && !isProvider) {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }

    // Get provider's live location if provider is assigned
    let providerLocation = null;
    let providerLiveStatus = null;
    
    if (job.providerId) {
      providerLiveStatus = await ProviderLiveStatus.findOne({ 
        providerId: job.providerId._id 
      }).lean();
      
      if (providerLiveStatus && providerLiveStatus.currentLocation) {
        providerLocation = {
          latitude: providerLiveStatus.currentLocation.coordinates[1],
          longitude: providerLiveStatus.currentLocation.coordinates[0],
          heading: providerLiveStatus.heading || 0,
          speed: providerLiveStatus.speed || 0,
          isManual: providerLiveStatus.currentLocation.isManual || false,
          lastUpdate: providerLiveStatus.currentLocation.lastUpdated || providerLiveStatus.lastSeen,
          address: providerLiveStatus.currentLocation.address || ''
        };
      }
    }

    // Calculate ETA if provider location exists
    let estimatedArrival = 'Calculating...';
    let distance = 'Calculating...';
    
    if (providerLocation && job.pickupLocation) {
      const distanceInKm = calculateDistance(
        providerLocation.latitude,
        providerLocation.longitude,
        job.pickupLocation.latitude,
        job.pickupLocation.longitude
      );
      
      distance = distanceInKm < 1 
        ? `${Math.round(distanceInKm * 1000)} m` 
        : `${distanceInKm.toFixed(1)} km`;
      
      estimatedArrival = calculateETA(
        providerLocation.latitude,
        providerLocation.longitude,
        job.pickupLocation.latitude,
        job.pickupLocation.longitude
      );
    }

    // Get provider's online status
    const isProviderOnline = providerLiveStatus?.isOnline || false;
    const lastSeen = providerLiveStatus?.lastSeen || job.acceptedAt;

    // Format response for frontend TrackProviderScreen
    const response = {
      success: true,
      data: {
        jobId: job._id,
        bookingId: job._id, // For frontend compatibility
        jobNumber: job.jobNumber,
        status: job.status,
        
        // Provider info
        provider: job.providerId ? {
          id: job.providerId.firebaseUserId,
          name: job.providerId.fullName,
          phone: job.providerId.phoneNumber,
          rating: job.providerId.rating || 4.5,
          profileImage: job.providerId.profileImage || '',
          vehicleDetails: job.providerId.vehicleDetails || 'Service vehicle',
          location: providerLocation,
          isOnline: isProviderOnline,
          lastSeen: lastSeen
        } : null,
        
        // Pickup location
        pickup: {
          address: job.pickupLocation.address,
          latitude: job.pickupLocation.latitude,
          longitude: job.pickupLocation.longitude
        },
        
        // Dropoff location (if exists)
        dropoff: job.dropoffLocation ? {
          address: job.dropoffLocation.address,
          latitude: job.dropoffLocation.latitude,
          longitude: job.dropoffLocation.longitude
        } : null,
        
        // Tracking info
        estimatedArrival,
        distance,
        serviceType: job.serviceType,
        serviceName: job.title,
        price: job.price,
        
        // Timeline
        requestedAt: job.requestedAt,
        acceptedAt: job.acceptedAt,
        enRouteAt: job.enRouteAt,
        arrivedAt: job.arrivedAt,
        startedAt: job.startedAt,
        
        // Customer info (for provider view)
        customer: isProvider ? {
          name: job.customerId?.fullName,
          phone: job.customerId?.phoneNumber
        } : null,
        
        // For direct param compatibility with existing frontend
        providerLat: providerLocation?.latitude,
        providerLng: providerLocation?.longitude,
        pickupLat: job.pickupLocation.latitude,
        pickupLng: job.pickupLocation.longitude,
        dropoffLat: job.dropoffLocation?.latitude,
        dropoffLng: job.dropoffLocation?.longitude,
        providerName: job.providerId?.fullName,
        providerId: job.providerId?.firebaseUserId,
        providerPhone: job.providerId?.phoneNumber,
        estimatedArrivalParam: estimatedArrival
      }
    };

    console.log('✅ Tracking info sent for job:', jobId);
    res.json(response);

  } catch (error) {
    console.error('❌ Error in getJobTrackingInfo:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// ==================== PROVIDER JOB CONTROLLERS ====================

// Get provider's recent jobs (for home page)
export const getProviderRecentJobs = async (req, res) => {
  try {
    const { providerId } = req.params;
    const { limit = 5 } = req.query;

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

    const jobs = await Job.find({
      providerId: provider._id,
      status: 'completed'
    })
    .sort({ completedAt: -1 })
    .limit(parseInt(limit))
    .select('title serviceType price completedAt customerRating');

    const formattedJobs = jobs.map(job => ({
      id: job._id,
      title: job.title || job.serviceType,
      time: getTimeAgo(job.completedAt),
      price: job.price,
      status: 'COMPLETED',
      rating: job.customerRating || null
    }));

    res.status(200).json({
      success: true,
      data: formattedJobs
    });

  } catch (error) {
    console.error('Error getting recent jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recent jobs',
      error: error.message
    });
  }
};

// Get provider's job history
export const getProviderJobHistory = async (req, res) => {
  try {
    const { providerId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

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

    const query = { providerId: provider._id };
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const jobs = await Job.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('customerId', 'fullName profileImage');

    const total = await Job.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        jobs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error getting job history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get job history',
      error: error.message
    });
  }
};

// Get today's jobs for provider
export const getTodaysJobs = async (req, res) => {
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

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const jobs = await Job.find({
      providerId: provider._id,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ createdAt: -1 });

    const completedJobs = jobs.filter(job => job.status === 'completed');
    const earnings = completedJobs.reduce((sum, job) => sum + job.price, 0);
    const hours = completedJobs.reduce((sum, job) => sum + (job.actualDuration / 60), 0);

    res.status(200).json({
      success: true,
      data: {
        jobs,
        stats: {
          total: jobs.length,
          completed: completedJobs.length,
          earnings: Math.round(earnings * 100) / 100,
          hours: Math.round(hours * 10) / 10,
          pending: jobs.filter(job => job.status === 'pending').length,
          inProgress: jobs.filter(job => ['accepted', 'en-route', 'arrived', 'in-progress'].includes(job.status)).length
        }
      }
    });

  } catch (error) {
    console.error('Error getting today\'s jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get today\'s jobs',
      error: error.message
    });
  }
};



// ==================== CUSTOMER FIND PROVIDER ====================
export const findProvider = async (req, res) => {
  try {
    console.log('='.repeat(70));
    console.log('🚀 FIND PROVIDER CONTROLLER STARTED');
    console.log('='.repeat(70));
    console.log('🕒 Timestamp:', new Date().toISOString());

    // Log 1: Check what's in req.user from auth middleware
    console.log('\n📋 LOG 1: AUTHENTICATION DATA');
    console.log('----------------------------------------');
    console.log('req.user present?', !!req.user);
    if (req.user) {
      console.log('req.user type:', typeof req.user);
      console.log('req.user keys:', Object.keys(req.user));
      console.log('Full req.user:', JSON.stringify(req.user, null, 2));
      
      // Check for ID in various possible locations
      console.log('Checking for ID fields:');
      console.log('- req.user.id:', req.user.id);
      console.log('- req.user._id:', req.user._id);
      console.log('- req.user.userId:', req.user.userId);
      console.log('- req.user.uid:', req.user.uid);
      console.log('- req.user.sub:', req.user.sub);
    } else {
      console.log('❌ req.user is null or undefined!');
    }

    // Log 2: Check Authorization Header
    console.log('\n📋 LOG 2: AUTHORIZATION HEADER');
    console.log('----------------------------------------');
    console.log('Auth header present?', !!req.headers['authorization']);
    if (req.headers['authorization']) {
      const authHeader = req.headers['authorization'];
      console.log('Auth header format:', authHeader.substring(0, 20) + '...');
      console.log('Starts with Bearer?', authHeader.startsWith('Bearer '));
    }

    // Log 3: Check Request Body
    console.log('\n📋 LOG 3: REQUEST BODY');
    console.log('----------------------------------------');
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Full request body:', JSON.stringify(req.body, null, 2));

    // Log 4: Extract Customer ID - TRY MULTIPLE SOURCES
    console.log('\n📋 LOG 4: EXTRACTING CUSTOMER ID');
    console.log('----------------------------------------');
    
    let customerId = null;
    let idSource = '';

    // Try to get from req.user (from auth middleware)
    if (req.user) {
      // Check all possible ID fields
      const possibleIdFields = ['id', '_id', 'userId', 'uid', 'sub', 'firebaseUserId'];
      
      for (const field of possibleIdFields) {
        if (req.user[field]) {
          customerId = req.user[field];
          idSource = `req.user.${field}`;
          console.log(`✅ Found ID in ${idSource}:`, customerId);
          break;
        }
      }
    }

    // If still no ID, try from request body
    if (!customerId && req.body.customerId) {
      customerId = req.body.customerId;
      idSource = 'req.body.customerId';
      console.log(`✅ Found ID in ${idSource}:`, customerId);
    }

    // If still no ID, try to extract from token manually
    if (!customerId && req.headers['authorization']) {
      try {
        const token = req.headers['authorization'].split(' ')[1];
        const decoded = jwt.decode(token); // Just decode without verification
        console.log('Manually decoded token:', decoded);
        
        if (decoded) {
          for (const field of ['id', '_id', 'userId', 'uid', 'sub']) {
            if (decoded[field]) {
              customerId = decoded[field];
              idSource = `decoded token.${field}`;
              console.log(`✅ Found ID in ${idSource}:`, customerId);
              break;
            }
          }
        }
      } catch (decodeError) {
        console.log('❌ Failed to decode token manually:', decodeError.message);
      }
    }

    // Final check for customerId
    console.log('\n📋 LOG 5: FINAL CUSTOMER ID CHECK');
    console.log('----------------------------------------');
    if (!customerId) {
      console.error('❌ CRITICAL: No customerId found in any location!');
      
      return res.status(401).json({
        success: false,
        message: 'User not authenticated properly. Please sign in again.',
        debug: {
          hasUser: !!req.user,
          userKeys: req.user ? Object.keys(req.user) : [],
          bodyKeys: Object.keys(req.body),
          hasAuthHeader: !!req.headers['authorization']
        }
      });
    }

    console.log('✅ FINAL CUSTOMER ID:', customerId);
    console.log('✅ ID SOURCE:', idSource);

    // Log 6: Parse Request Body Data
    console.log('\n📋 LOG 6: PARSED REQUEST DATA');
    console.log('----------------------------------------');
    
    const {
      pickup,
      dropoff,
      serviceId,
      serviceName,
      servicePrice,
      serviceCategory,
      isCarRental,
      isFuelDelivery,
      isSpareParts,
      vehicle,
      customer,
      additionalDetails,
      schedule,
      payment,
      locationSkipped,
      timestamp,
      platform,
      version
    } = req.body;

    console.log('Service Info:', { serviceId, serviceName, servicePrice, serviceCategory });
    console.log('Pickup:', pickup);
    console.log('Dropoff:', dropoff);
    console.log('Vehicle:', vehicle);
    console.log('Customer Contact:', customer);
    console.log('Schedule:', schedule);
    console.log('Payment:', payment);

    // Log 7: Generate IDs
    console.log('\n📋 LOG 7: GENERATING IDs');
    console.log('----------------------------------------');
    
    const bookingId = generateBookingId();
    const jobNumber = generateJobNumber();
    
    console.log('✅ Generated bookingId:', bookingId);
    console.log('✅ Generated jobNumber:', jobNumber);

    // Log 8: Transform Location Data
    console.log('\n📋 LOG 8: TRANSFORMING LOCATION DATA');
    console.log('----------------------------------------');
    
    const pickupLocation = {
      address: pickup?.address || 'Pickup location',
      latitude: pickup?.coordinates?.lat || 0,
      longitude: pickup?.coordinates?.lng || 0,
      coordinates: pickup?.coordinates?.lng && pickup?.coordinates?.lat 
        ? [pickup.coordinates.lng, pickup.coordinates.lat] 
        : [0, 0]
    };

    const dropoffLocation = dropoff?.address ? {
      address: dropoff.address,
      latitude: dropoff?.coordinates?.lat || 0,
      longitude: dropoff?.coordinates?.lng || 0,
      coordinates: dropoff?.coordinates?.lng && dropoff?.coordinates?.lat 
        ? [dropoff.coordinates.lng, dropoff.coordinates.lat] 
        : [0, 0]
    } : undefined;

    console.log('📍 Pickup location transformed:', pickupLocation);
    console.log('📍 Dropoff location transformed:', dropoffLocation || 'Not provided');

    // Log 9: Create Job Object
    console.log('\n📋 LOG 9: CREATING JOB OBJECT');
    console.log('----------------------------------------');
    
    const job = new Job({
      bookingId,
      jobNumber,
      customerId, // This should now be set correctly
      
      serviceId,
      serviceName,
      servicePrice: parseFloat(servicePrice) || 0,
      serviceCategory,
      serviceTime: schedule?.type || 'right_now',
      
      isCarRental: isCarRental || false,
      isFuelDelivery: isFuelDelivery || false,
      isSpareParts: isSpareParts || false,
      
      title: serviceName,
      serviceType: serviceCategory,
      description: additionalDetails?.description || '',
      
      price: payment?.totalAmount || parseFloat(servicePrice) || 0,
      paymentMethod: payment?.paymentMethod || 'cash',
      paymentStatus: 'pending',
      
      pickup: pickupLocation,
      dropoff: dropoffLocation,
      
      vehicle: vehicle || {},
      customer: customer || {},
      additionalDetails: additionalDetails || {},
      schedule: schedule || {},
      payment: payment || {},
      locationSkipped: locationSkipped || false,
      selectedTip: payment?.selectedTip || 0,
      
      status: 'pending',
      requestedAt: new Date(),
      estimatedDuration: 30,
      
      metadata: {
        vehicle,
        customer,
        additionalDetails,
        schedule,
        payment,
        locationSkipped,
        serviceId,
        isCarRental,
        isFuelDelivery,
        isSpareParts,
        timestamp,
        platform,
        version
      }
    });

    console.log('✅ Job object created with customerId:', job.customerId);
    console.log('Job object preview:', {
      bookingId: job.bookingId,
      jobNumber: job.jobNumber,
      customerId: job.customerId,
      serviceName: job.serviceName,
      status: job.status
    });

    // Log 10: Save Job
    console.log('\n📋 LOG 10: SAVING JOB TO DATABASE');
    console.log('----------------------------------------');
    
    console.log('Attempting to save job...');
    await job.save();
    console.log('✅ Job saved successfully!');
    console.log('📌 MongoDB _id:', job._id);
    console.log('📌 Booking ID:', job.bookingId);
    console.log('📌 Job Number:', job.jobNumber);

    // Log 11: Find Nearby Providers
    console.log('\n📋 LOG 11: FINDING NEARBY PROVIDERS');
    console.log('----------------------------------------');
    
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    console.log('Looking for providers active since:', fifteenMinutesAgo.toISOString());
    
    console.log('Search coordinates:', [pickupLocation.longitude, pickupLocation.latitude]);
    
    const eligibleProviders = await ProviderLiveStatus.find({
      isOnline: true,
      isAvailable: true,
      lastSeen: { $gte: fifteenMinutesAgo },
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [pickupLocation.longitude, pickupLocation.latitude]
          },
          $maxDistance: 20000 // 20km radius
        }
      }
    }).populate('providerId', 'firebaseUserId fullName rating totalJobsCompleted profileImage phone vehicleDetails licensePlate');

    console.log(`✅ Found ${eligibleProviders.length} eligible providers nearby`);
    
    if (eligibleProviders.length > 0) {
      console.log('Provider details:');
      eligibleProviders.forEach((p, index) => {
        console.log(`  Provider ${index + 1}:`, {
          name: p.providerId?.fullName,
          firebaseId: p.providerId?.firebaseUserId,
          distance: 'within 20km',
          rating: p.providerId?.rating
        });
      });
    }

    // Log 12: Prepare WebSocket Data
    console.log('\n📋 LOG 12: PREPARING WEBSOCKET DATA');
    console.log('----------------------------------------');
    
    const jobRequestData = {
      jobId: job._id.toString(),
      bookingId: job.bookingId,
      jobNumber: job.jobNumber,
      serviceType: serviceCategory,
      serviceName: serviceName,
      serviceId: serviceId,
      price: payment?.totalAmount || servicePrice,
      estimatedEarnings: payment?.totalAmount || servicePrice,
      pickupLocation: pickup?.address || 'Pickup location',
      pickupLat: pickup?.coordinates?.lat || 0,
      pickupLng: pickup?.coordinates?.lng || 0,
      dropoffLocation: dropoff?.address || null,
      dropoffLat: dropoff?.coordinates?.lat || null,
      dropoffLng: dropoff?.coordinates?.lng || null,
      customerName: customer?.name || 'Customer',
      customerPhone: customer?.phone || '',
      customerId: customerId,
      distance: '0',
      urgency: additionalDetails?.urgency || 'normal',
      description: additionalDetails?.description || '',
      vehicleDetails: vehicle?.makeModel || '',
      vehicle: vehicle || {},
      additionalDetails: additionalDetails || {},
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString()
    };

    console.log('WebSocket data prepared:', JSON.stringify(jobRequestData, null, 2));

    // Log 13: Send via WebSocket
    console.log('\n📋 LOG 13: SENDING WEBSOCKET NOTIFICATIONS');
    console.log('----------------------------------------');
    
    const wsManager = req.app.get('wsManager');
    console.log('WebSocket manager available?', !!wsManager);
    
    const providerIds = eligibleProviders
      .map(p => p.providerId?.firebaseUserId)
      .filter(id => id);
    
    console.log('Provider Firebase IDs to notify:', providerIds);
    
    if (providerIds.length > 0 && wsManager) {
      const sentCount = wsManager.sendJobRequestToProviders(jobRequestData, providerIds);
      console.log(`📨 Sent job request to ${sentCount}/${providerIds.length} providers via WebSocket`);
      
      if (sentCount < providerIds.length) {
        console.log(`⚠️ Failed to send to ${providerIds.length - sentCount} providers`);
      }
    } else {
      console.log('⚠️ No providers to notify or WebSocket manager not available');
    }

    // Log 14: Send Response
    console.log('\n📋 LOG 14: SENDING RESPONSE TO CLIENT');
    console.log('----------------------------------------');
    
    const response = {
      success: true,
      message: 'Searching for providers',
      bookingId: job.bookingId,
      jobNumber: job.jobNumber,
      jobId: job._id,
      status: job.status,
      providersFound: eligibleProviders.length,
      estimatedWaitTime: eligibleProviders.length > 0 ? '30-60 seconds' : '2-3 minutes',
      websocketEnabled: true
    };

    console.log('Response being sent:', JSON.stringify(response, null, 2));
    console.log('='.repeat(70));
    console.log('✅ FIND PROVIDER CONTROLLER COMPLETED SUCCESSFULLY');
    console.log('='.repeat(70));

    return res.status(200).json(response);

  } catch (error) {
    console.error('\n❌❌❌ ERROR IN FIND PROVIDER CONTROLLER ❌❌❌');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.name === 'ValidationError') {
      console.error('Mongoose Validation Error Details:', error.errors);
    }
    
    if (error.name === 'MongoServerError' && error.code === 11000) {
      console.error('Duplicate key error:', error.keyValue);
    }
    
    console.error('='.repeat(70));
    
    return res.status(500).json({
      success: false,
      message: 'Failed to process request',
      error: error.message,
      errorType: error.name
    });
  }
};








// ==================== PROVIDER JOB DETAILS ====================

export const getJobDetailsForProvider = async (req, res) => {
  try {
    const { jobId } = req.params;
    const providerId = req.user.id;

    const job = await Job.findById(jobId)
      .populate('customerId', 'fullName phoneNumber profileImage rating totalJobsCompleted')
      .lean();

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (job.status !== 'pending' || job.providerId) {
      return res.status(400).json({
        success: false,
        message: 'This job is no longer available',
        status: job.status
      });
    }

    // Calculate distance from provider to pickup
    let distanceToPickup = 'Calculating...';
    try {
      const liveStatus = await ProviderLiveStatus.findOne({ providerId });
      if (liveStatus?.currentLocation) {
        const dist = calculateDistance(
          liveStatus.currentLocation.coordinates[1],
          liveStatus.currentLocation.coordinates[0],
          job.pickupLocation.latitude,
          job.pickupLocation.longitude
        );
        distanceToPickup = dist < 1 
          ? `${Math.round(dist * 1000)} m` 
          : `${dist.toFixed(1)} km`;
      }
    } catch (err) {
      console.log('Error calculating distance:', err);
    }

    const jobDetails = {
      jobId: job._id,
      jobNumber: job.jobNumber,
      serviceType: job.serviceType,
      title: job.title,
      description: job.description,
      price: job.price,
      paymentMethod: job.paymentMethod,
      customer: {
        name: job.customerId?.fullName || 'Customer',
        phone: job.customerId?.phoneNumber,
        rating: job.customerId?.rating || 0,
        profileImage: job.customerId?.profileImage,
        totalJobs: job.customerId?.totalJobsCompleted || 0
      },
      pickupLocation: {
        address: job.pickupLocation.address,
        coordinates: {
          lat: job.pickupLocation.latitude,
          lng: job.pickupLocation.longitude
        }
      },
      dropoffLocation: job.dropoffLocation ? {
        address: job.dropoffLocation.address,
        coordinates: {
          lat: job.dropoffLocation.latitude,
          lng: job.dropoffLocation.longitude
        }
      } : null,
      vehicle: job.metadata?.vehicle || {},
      additionalInfo: job.metadata?.additionalDetails || {},
      requestedAt: job.requestedAt,
      distanceToPickup
    };

    return res.status(200).json({
      success: true,
      data: jobDetails
    });

  } catch (error) {
    console.error('Error getting job details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get job details',
      error: error.message
    });
  }
};

// ==================== PROVIDER ACCEPT JOB ====================

export const acceptJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const providerId = req.user.id;

    console.log('='.repeat(50));
    console.log('✅ ACCEPT JOB CONTROLLER STARTED');
    console.log('Job ID:', jobId);
    console.log('Provider ID:', providerId);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const job = await Job.findByIdAndUpdate(
        jobId,
        {
          providerId,
          status: 'accepted',
          acceptedAt: new Date()
        },
        { 
          new: true,
          session,
          runValidators: true 
        }
      ).populate('customerId', 'firebaseUserId fullName phoneNumber');

      if (!job) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }

      if (job.providerId && job.providerId.toString() !== providerId.toString()) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'This job has already been accepted by another provider'
        });
      }

      await ProviderLiveStatus.findOneAndUpdate(
        { providerId },
        {
          isAvailable: false,
          currentTaskId: job._id,
          lastSeen: new Date()
        },
        { session, upsert: true }
      );

      await session.commitTransaction();
      session.endSession();

      const provider = await User.findById(providerId).select(
        'fullName rating profileImage firebaseUserId phoneNumber vehicleDetails'
      );

      // Get provider's current location for ETA calculation
      let providerLocation = null;
      let estimatedArrival = '10-15 minutes';
      
      try {
        const liveStatus = await ProviderLiveStatus.findOne({ providerId });
        if (liveStatus && liveStatus.currentLocation) {
          providerLocation = {
            latitude: liveStatus.currentLocation.coordinates[1],
            longitude: liveStatus.currentLocation.coordinates[0],
            lastUpdate: liveStatus.currentLocation.lastUpdated
          };
          
          // Calculate ETA
          estimatedArrival = calculateETA(
            providerLocation.latitude,
            providerLocation.longitude,
            job.pickupLocation.latitude,
            job.pickupLocation.longitude
          );
        }
      } catch (locError) {
        console.error('Error getting provider location:', locError);
      }

      const providerData = {
        jobId: job._id.toString(),
        bookingId: job._id.toString(),
        jobNumber: job.jobNumber,
        providerId: provider.firebaseUserId || providerId.toString(),
        providerName: provider.fullName,
        providerRating: provider.rating || 4.5,
        providerImage: provider.profileImage || '',
        providerPhone: provider.phoneNumber || '',
        serviceType: job.serviceType,
        serviceName: job.title || job.serviceType,
        serviceId: job.metadata?.serviceId,
        pickupLocation: job.pickupLocation?.address || '',
        pickupLat: job.pickupLocation?.latitude || 0,
        pickupLng: job.pickupLocation?.longitude || 0,
        dropoffLocation: job.dropoffLocation?.address || '',
        dropoffLat: job.dropoffLocation?.latitude || null,
        dropoffLng: job.dropoffLocation?.longitude || null,
        price: job.price || 0,
        estimatedEarnings: job.price || 0,
        distance: 'Calculating...',
        urgency: job.metadata?.additionalDetails?.urgency || 'normal',
        estimatedArrival,
        vehicleDetails: provider.vehicleDetails || 'Service vehicle',
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
        providerLocation,
        customerName: job.metadata?.customer?.name || 'Customer',
        customerPhone: job.customerId?.phoneNumber || '',
        vehicleType: job.metadata?.vehicle?.type || '',
        vehicleMakeModel: job.metadata?.vehicle?.makeModel || '',
        vehicleYear: job.metadata?.vehicle?.year || '',
        vehicleColor: job.metadata?.vehicle?.color || '',
        vehicleLicensePlate: job.metadata?.vehicle?.licensePlate || '',
        description: job.metadata?.additionalDetails?.description || '',
        metadata: job.metadata
      };

      const wsManager = req.app.get('wsManager');
      if (job.customerId?.firebaseUserId) {
        const messageData = {
          type: 'job_accepted',
          data: providerData
        };
        
        console.log('📨 Sending job_accepted message to customer:', job.customerId.firebaseUserId);
        const sent = wsManager.sendToUser(job.customerId.firebaseUserId, messageData);
        console.log('job_accepted send result:', sent ? '✅ Sent' : '❌ Failed');
        
        // Send backup messages with different types
        const backupMessage = {
          type: 'provider_assigned',
          data: providerData
        };
        wsManager.sendToUser(job.customerId.firebaseUserId, backupMessage);
        
        const statusMessage = {
          type: 'status_update',
          data: {
            bookingId: job._id.toString(),
            status: 'accepted',
            provider: providerData
          }
        };
        wsManager.sendToUser(job.customerId.firebaseUserId, statusMessage);
      }

      return res.status(200).json({
        success: true,
        message: 'Job accepted successfully',
        data: {
          jobId: job._id,
          jobNumber: job.jobNumber,
          status: job.status,
          customerLocation: job.pickupLocation,
          customerPhone: job.customerId?.phoneNumber,
          estimatedArrival
        }
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

  } catch (error) {
    console.error('❌ Error accepting job:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to accept job',
      error: error.message
    });
  }
};

// ==================== PROVIDER STATUS UPDATE ====================

// Update provider en-route status
export const providerEnRoute = async (req, res) => {
  try {
    const { jobId } = req.params;
    const providerId = req.user.id;

    console.log('🚗 PROVIDER EN-ROUTE CONTROLLER STARTED');
    console.log('Job ID:', jobId);
    console.log('Provider ID:', providerId);

    const job = await Job.findByIdAndUpdate(
      jobId,
      {
        status: 'en-route',
        enRouteAt: new Date()
      },
      { new: true }
    ).populate('customerId', 'firebaseUserId fullName');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const provider = await User.findById(providerId).select('fullName');

    // Get provider's current location for ETA update
    let eta = 'Calculating...';
    try {
      const liveStatus = await ProviderLiveStatus.findOne({ providerId });
      if (liveStatus?.currentLocation) {
        eta = calculateETA(
          liveStatus.currentLocation.coordinates[1],
          liveStatus.currentLocation.coordinates[0],
          job.pickupLocation.latitude,
          job.pickupLocation.longitude
        );
      }
    } catch (err) {
      console.log('Error calculating ETA:', err);
    }

    const wsManager = req.app.get('wsManager');
    if (job.customerId?.firebaseUserId) {
      wsManager.sendToUser(job.customerId.firebaseUserId, {
        type: 'provider_status_update',
        data: {
          bookingId: job._id.toString(),
          status: 'en-route',
          message: `${provider.fullName} is on the way to your location`,
          eta,
          timestamp: new Date().toISOString()
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Status updated to en-route',
      data: { 
        status: job.status,
        enRouteAt: job.enRouteAt,
        eta
      }
    });
  } catch (error) {
    console.error('Error in providerEnRoute:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message
    });
  }
};

// Provider arrived at location
export const providerArrived = async (req, res) => {
  try {
    const { jobId } = req.params;
    const providerId = req.user.id;

    console.log('🚗 PROVIDER ARRIVED CONTROLLER STARTED');
    console.log('Job ID:', jobId);
    console.log('Provider ID:', providerId);

    const job = await Job.findByIdAndUpdate(
      jobId,
      {
        status: 'arrived',
        arrivedAt: new Date()
      },
      { new: true }
    ).populate('customerId', 'firebaseUserId fullName');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const provider = await User.findById(providerId).select('fullName');

    const wsManager = req.app.get('wsManager');
    if (job.customerId?.firebaseUserId) {
      wsManager.sendToUser(job.customerId.firebaseUserId, {
        type: 'provider_status_update',
        data: {
          bookingId: job._id.toString(),
          status: 'arrived',
          message: `${provider.fullName} has arrived at your location`,
          timestamp: new Date().toISOString()
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Arrival confirmed',
      data: { 
        status: job.status,
        arrivedAt: job.arrivedAt
      }
    });
  } catch (error) {
    console.error('Error in providerArrived:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update arrival status',
      error: error.message
    });
  }
};

// Provider start service
export const providerStartService = async (req, res) => {
  try {
    const { jobId } = req.params;
    const providerId = req.user.id;

    console.log('▶️ PROVIDER START SERVICE CONTROLLER STARTED');
    console.log('Job ID:', jobId);
    console.log('Provider ID:', providerId);

    const job = await Job.findByIdAndUpdate(
      jobId,
      {
        status: 'in-progress',
        startedAt: new Date()
      },
      { new: true }
    ).populate('customerId', 'firebaseUserId fullName');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const provider = await User.findById(providerId).select('fullName');

    const wsManager = req.app.get('wsManager');
    if (job.customerId?.firebaseUserId) {
      wsManager.sendToUser(job.customerId.firebaseUserId, {
        type: 'provider_status_update',
        data: {
          bookingId: job._id.toString(),
          status: 'started',
          message: 'Service has started',
          startedAt: new Date().toISOString()
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Service started',
      data: { 
        status: job.status,
        startedAt: job.startedAt
      }
    });
  } catch (error) {
    console.error('Error in providerStartService:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start service',
      error: error.message
    });
  }
};

// Provider complete service
export const providerCompleteService = async (req, res) => {
  try {
    const { jobId } = req.params;
    const providerId = req.user.id;
    const { notes, completedItems, totalItems, finalEarnings, serviceDuration } = req.body;

    console.log('✅ PROVIDER COMPLETE SERVICE CONTROLLER STARTED');
    console.log('Job ID:', jobId);
    console.log('Provider ID:', providerId);

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    job.status = 'completed';
    job.completedAt = new Date();
    job.providerNotes = notes;
    job.actualDuration = serviceDuration;
    
    if (job.metadata) {
      job.metadata.completedItems = completedItems;
      job.metadata.totalItems = totalItems;
    }

    await job.save();

    const updatedJob = await Job.findById(jobId).populate('customerId', 'firebaseUserId fullName');

    const provider = await User.findById(providerId).select('fullName');

    // Update provider availability
    await ProviderLiveStatus.findOneAndUpdate(
      { providerId },
      {
        isAvailable: true,
        currentTaskId: null,
        lastSeen: new Date()
      }
    );

    const wsManager = req.app.get('wsManager');
    if (updatedJob.customerId?.firebaseUserId) {
      wsManager.sendToUser(updatedJob.customerId.firebaseUserId, {
        type: 'job_completed',
        data: {
          bookingId: updatedJob._id.toString(),
          status: 'completed',
          message: 'Service has been completed',
          completedAt: new Date().toISOString(),
          finalEarnings
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Service completed successfully',
      data: {
        jobId: updatedJob._id,
        status: updatedJob.status,
        completedAt: updatedJob.completedAt
      }
    });
  } catch (error) {
    console.error('Error in providerCompleteService:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete service',
      error: error.message
    });
  }
};

// ==================== CUSTOMER CHECK JOB STATUS ====================

export const checkJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    const job = await Job.findById(jobId)
      .populate('providerId', 'fullName phoneNumber rating profileImage firebaseUserId')
      .lean();

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (job.customerId.toString() !== userId.toString() && 
        (!job.providerId || job.providerId._id.toString() !== userId.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    let response = {
      success: true,
      status: job.status,
      jobId: job._id,
      jobNumber: job.jobNumber
    };

    if (job.providerId && job.status !== 'pending' && job.status !== 'cancelled') {
      response.provider = {
        id: job.providerId._id,
        firebaseUserId: job.providerId.firebaseUserId,
        name: job.providerId.fullName,
        rating: job.providerId.rating,
        profileImage: job.providerId.profileImage,
        phoneNumber: job.providerId.phoneNumber
      };
      
      if (job.status === 'accepted' || job.status === 'en-route') {
        // Get provider location for ETA
        try {
          const liveStatus = await ProviderLiveStatus.findOne({ 
            providerId: job.providerId._id 
          });
          
          if (liveStatus?.currentLocation) {
            const eta = calculateETA(
              liveStatus.currentLocation.coordinates[1],
              liveStatus.currentLocation.coordinates[0],
              job.pickupLocation.latitude,
              job.pickupLocation.longitude
            );
            response.estimatedArrival = eta;
          } else {
            response.estimatedArrival = '10-15 minutes';
          }
        } catch (err) {
          response.estimatedArrival = '10-15 minutes';
        }
      }
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error checking job status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check job status',
      error: error.message
    });
  }
};

// ==================== CUSTOMER SUBMIT RATING ====================

export const submitRating = async (req, res) => {
  try {
    const { jobId } = req.params;
    const customerId = req.user.id;
    const { rating, providerId, review } = req.body;

    console.log('⭐ CUSTOMER SUBMIT RATING CONTROLLER STARTED');
    console.log('Job ID:', jobId);
    console.log('Rating:', rating);
    console.log('Provider ID:', providerId);

    const job = await Job.findByIdAndUpdate(
      jobId,
      {
        customerRating: rating,
        customerReview: review || '',
        reviewSubmittedAt: new Date()
      },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const provider = await User.findById(providerId);
    if (provider) {
      const totalRatings = provider.totalRatings || 0;
      const currentRating = provider.rating || 0;
      
      const newRating = ((currentRating * totalRatings) + rating) / (totalRatings + 1);
      
      await User.findByIdAndUpdate(providerId, {
        rating: Number(newRating.toFixed(1)),
        totalRatings: totalRatings + 1,
        totalReviews: (provider.totalReviews || 0) + 1
      });
    }

    const wsManager = req.app.get('wsManager');
    const providerUser = await User.findById(providerId).select('firebaseUserId');
    
    if (providerUser?.firebaseUserId) {
      wsManager.sendToUser(providerUser.firebaseUserId, {
        type: 'new_rating',
        data: {
          jobId: job._id.toString(),
          rating,
          customerName: job.metadata?.customer?.name || 'Customer',
          review: review || ''
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Rating submitted successfully'
    });
  } catch (error) {
    console.error('Error in submitRating:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit rating',
      error: error.message
    });
  }
};