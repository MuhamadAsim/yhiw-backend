import User from '../models/userModel.js';
import Notification from '../models/notificationModel.js';
import Job from '../models/jobModel.js';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import axios from 'axios';
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;


// ==================== LOCATION CONTROLLERS ====================

// Get all saved locations for a user
export const getSavedLocations = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ firebaseUserId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: user.savedLocations || []
    });
  } catch (error) {
    console.error('Error fetching saved locations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch saved locations',
      error: error.message
    });
  }
};

// Save a new location
export const saveLocation = async (req, res) => {
  try {
    const { userId } = req.params;
    const { title, address, latitude, longitude, type, placeId, isFavorite } = req.body;

    // Validation
    if (!title || !address || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, address, latitude, longitude'
      });
    }

    const user = await User.findOne({ firebaseUserId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if location already exists
    const existingLocation = user.savedLocations.find(
      loc => loc.latitude === latitude && loc.longitude === longitude
    );

    if (existingLocation) {
      return res.status(400).json({
        success: false,
        message: 'Location already saved'
      });
    }

    // Add new location
    const newLocation = {
      title,
      address,
      latitude,
      longitude,
      type: type || 'other',
      placeId,
      isFavorite: isFavorite || false
    };

    user.savedLocations.push(newLocation);
    await user.save();

    const addedLocation = user.savedLocations[user.savedLocations.length - 1];

    return res.status(201).json({
      success: true,
      message: 'Location saved successfully',
      data: addedLocation
    });
  } catch (error) {
    console.error('Error saving location:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save location',
      error: error.message
    });
  }
};

// Update a saved location
export const updateLocation = async (req, res) => {
  try {
    const { userId, locationId } = req.params;
    const updates = req.body;

    const user = await User.findOne({ firebaseUserId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const location = user.savedLocations.id(locationId);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    Object.keys(updates).forEach(key => {
      if (key !== '_id' && key !== 'createdAt' && key !== 'updatedAt') {
        location[key] = updates[key];
      }
    });

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Location updated successfully',
      data: location
    });
  } catch (error) {
    console.error('Error updating location:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message
    });
  }
};

// Delete a saved location
export const deleteLocation = async (req, res) => {
  try {
    const { userId, locationId } = req.params;

    const user = await User.findOne({ firebaseUserId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.savedLocations = user.savedLocations.filter(
      loc => loc._id.toString() !== locationId
    );

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Location deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting location:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete location',
      error: error.message
    });
  }
};

// Add to recent locations
export const addRecentLocation = async (req, res) => {
  try {
    const { userId } = req.params;
    const { title, address, latitude, longitude, placeId } = req.body;

    const user = await User.findOne({ firebaseUserId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.recentLocations = user.recentLocations.filter(
      loc => !(loc.latitude === latitude && loc.longitude === longitude)
    );

    user.recentLocations.unshift({
      title,
      address,
      latitude,
      longitude,
      placeId,
      lastUsed: new Date()
    });

    if (user.recentLocations.length > 20) {
      user.recentLocations = user.recentLocations.slice(0, 20);
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Recent location added',
      data: user.recentLocations
    });
  } catch (error) {
    console.error('Error adding recent location:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add recent location',
      error: error.message
    });
  }
};

// Get recent locations
export const getRecentLocations = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ firebaseUserId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: user.recentLocations || []
    });
  } catch (error) {
    console.error('Error fetching recent locations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch recent locations',
      error: error.message
    });
  }
};

// Clear all recent locations
export const clearRecentLocations = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ firebaseUserId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.recentLocations = [];
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Recent locations cleared'
    });
  } catch (error) {
    console.error('Error clearing recent locations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear recent locations',
      error: error.message
    });
  }
};

// Toggle favorite location
export const toggleFavoriteLocation = async (req, res) => {
  try {
    const { userId, locationId } = req.params;
    const { isFavorite } = req.body;

    const user = await User.findOne({ firebaseUserId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const location = user.savedLocations.id(locationId);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    location.isFavorite = isFavorite;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `Location ${isFavorite ? 'added to' : 'removed from'} favorites`,
      data: location
    });
  } catch (error) {
    console.error('Error toggling favorite:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to toggle favorite',
      error: error.message
    });
  }
};


// ==================== JOB CONTROLLERS FOR CUSTOMER ====================

// Get complete job details for customer
export const getCustomerJobDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.id;

    console.log(`📋 Customer fetching job details: ${bookingId}`);

    const job = await Job.findOne({
      bookingId,
      customerId
    }).populate('providerId', 'fullName phoneNumber profileImage rating completedJobs yearsOfExperience');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const providerLocation = await ProviderLiveStatus.findOne({
      providerId: job.providerId
    });

    let estimatedArrival = '15 min';
    let distance = '2.5 km';

    if (providerLocation?.currentLocation?.coordinates &&
      job.bookingData?.pickup?.coordinates) {

      const providerLat = providerLocation.currentLocation.coordinates[1];
      const providerLng = providerLocation.currentLocation.coordinates[0];
      const pickupLat = job.bookingData.pickup.coordinates.lat;
      const pickupLng = job.bookingData.pickup.coordinates.lng;

      try {
        const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${providerLat},${providerLng}&destinations=${pickupLat},${pickupLng}&key=${googleMapsApiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
          estimatedArrival = data.rows[0].elements[0].duration.text;
          distance = data.rows[0].elements[0].distance.text;
          console.log(`📍 Google Maps: ETA ${estimatedArrival}, Distance ${distance}`);
        }
      } catch (mapsError) {
        console.error('Google Maps API error:', mapsError);
        const simpleDistance = calculateSimpleDistance(
          providerLat, providerLng,
          pickupLat, pickupLng
        );
        distance = `${simpleDistance.toFixed(1)} km`;
        estimatedArrival = `${Math.ceil(simpleDistance * 12)} min`;
      }
    }

    const mapJobStatus = (dbStatus) => {
      const statusMap = {
        'accepted': 'accepted',
        'in_progress': 'started',
        'completed': 'completed',
        'cancelled': 'cancelled',
        'completed_conformed': 'completed_conformed',
      };
      return statusMap[dbStatus] || dbStatus;
    };

    // Format duration from timeTracking if available
    const formatDuration = (totalSeconds) => {
      if (!totalSeconds || totalSeconds === 0) return '35 minutes';

      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);

      if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes > 1 ? 's' : ''}`;
      }
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    };

    const jobDetails = {
      bookingId: job.bookingId,
      status: mapJobStatus(job.status),
      serviceType: job.bookingData?.serviceCategory || '',
      serviceName: job.bookingData?.serviceName || '',
      vehicleType: job.bookingData?.vehicle?.type || '',

      pickup: {
        address: job.bookingData?.pickup?.address || '',
        coordinates: job.bookingData?.pickup?.coordinates || { lat: 0, lng: 0 }
      },

      dropoff: job.bookingData?.dropoff ? {
        address: job.bookingData.dropoff.address,
        coordinates: job.bookingData.dropoff.coordinates
      } : undefined,

      provider: job.providerId ? {
        id: job.providerId._id,
        name: job.providerId.fullName || 'Provider',
        phone: job.providerId.phoneNumber || '',
        rating: job.providerId.rating || 4.5,
        profileImage: job.providerId.profileImage,
        yearsOfExperience: job.providerId.yearsOfExperience || 3,
        completedJobs: job.providerId.completedJobs || 127,
        vehicle: {
          type: job.bookingData?.vehicle?.type || 'Service Vehicle',
          makeModel: job.bookingData?.vehicle?.makeModel || 'Professional Vehicle',
          licensePlate: job.bookingData?.vehicle?.licensePlate || 'BHR 1234',
          color: job.bookingData?.vehicle?.color || 'White',
          description: `${job.bookingData?.vehicle?.color || 'White'} ${job.bookingData?.vehicle?.makeModel || 'Service Vehicle'}`
        }
      } : null,

      providerLocation: providerLocation?.currentLocation ? {
        latitude: providerLocation.currentLocation.coordinates[1],
        longitude: providerLocation.currentLocation.coordinates[0],
        heading: providerLocation.heading || 0,
        updatedAt: providerLocation.currentLocation.lastUpdated
      } : null,

      // ⭐ TIMER DATA - Added for the completion screen
      timeTracking: {
        totalSeconds: job.timeTracking?.totalSeconds || 0,
        isPaused: job.timeTracking?.isPaused || false,
        pausedAt: job.timeTracking?.pausedAt || null,
        timeExtensions: job.timeTracking?.timeExtensions || [],
        startedAt: job.timeTracking?.startedAt || null,
        completedAt: job.timeTracking?.completedAt || null
      },

      // ⭐ Timeline data for completion time
      timeline: {
        acceptedAt: job.acceptedAt || null,
        startedAt: job.startedAt || null,
        completedAt: job.completedAt || null,
        cancelledAt: job.cancelledAt || null
      },

      payment: {
        totalAmount: job.bookingData?.payment?.totalAmount || 0,
        baseFee: job.bookingData?.payment?.baseServiceFee || 0,
        tip: job.bookingData?.payment?.selectedTip || 0
      },

      // ⭐ Formatted duration for convenience
      formattedDuration: formatDuration(job.timeTracking?.totalSeconds),

      estimatedArrival: estimatedArrival,
      distance: distance,
      createdAt: job.acceptedAt || job.createdAt
    };

    // Log to verify timer data is included
    console.log('✅ Job details fetched with timer:', {
      bookingId: job.bookingId,
      totalSeconds: job.timeTracking?.totalSeconds,
      formatted: formatDuration(job.timeTracking?.totalSeconds),
      completedAt: job.completedAt
    });

    res.json({
      success: true,
      job: jobDetails
    });

  } catch (error) {
    console.error('Get customer job details error:', error);
    res.status(500).json({ error: error.message });
  }
};



// Get provider's real-time location
export const getProviderLocationForCustomer = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.id;

    const job = await Job.findOne({ bookingId, customerId });

    if (!job || !job.providerId) {
      return res.status(404).json({
        success: false,
        message: 'Job or provider not found'
      });
    }

    const providerLocation = await ProviderLiveStatus.findOne({
      providerId: job.providerId
    });

    if (!providerLocation?.currentLocation?.coordinates) {
      return res.json({
        success: true,
        location: null
      });
    }

    let eta = null;
    if (job.bookingData?.pickup?.coordinates) {
      try {
        const providerLat = providerLocation.currentLocation.coordinates[1];
        const providerLng = providerLocation.currentLocation.coordinates[0];
        const pickupLat = job.bookingData.pickup.coordinates.lat;
        const pickupLng = job.bookingData.pickup.coordinates.lng;

        const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${providerLat},${providerLng}&destinations=${pickupLat},${pickupLng}&key=${googleMapsApiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
          eta = {
            text: data.rows[0].elements[0].duration.text,
            value: data.rows[0].elements[0].duration.value,
            distance: data.rows[0].elements[0].distance.text
          };
        }
      } catch (mapsError) {
        console.error('Google Maps ETA error:', mapsError);
      }
    }

    res.json({
      success: true,
      location: {
        latitude: providerLocation.currentLocation.coordinates[1],
        longitude: providerLocation.currentLocation.coordinates[0],
        heading: providerLocation.heading || 0,
        updatedAt: providerLocation.currentLocation.lastUpdated,
        eta: eta
      }
    });

  } catch (error) {
    console.error('Get provider location error:', error);
    res.status(500).json({ error: error.message });
  }
};




// GET /api/jobs/:bookingId/status
export const getJobStatusForCustomer = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.id;

    const job = await Job.findOne({ bookingId, customerId });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const statusMap = {
      'accepted': 'accepted',
      'in_progress': 'started',
      'completed': 'completed',
      'cancelled': 'cancelled',
      'completed_confirmed': 'completed_confirmed',

    };

    res.json({
      success: true,
      status: statusMap[job.status] || job.status,
      updatedAt: job.updatedAt
    });

  } catch (error) {
    console.error('Get job status error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Cancel job from customer side
export const customerCancelJob = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.id;
    const { reason } = req.body;

    const job = await Job.findOne({ bookingId, customerId });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (job.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel completed job'
      });
    }

    job.status = 'cancelled';
    job.cancelledAt = new Date();
    job.cancelledBy = 'customer';
    await job.save();

    if (job.providerId) {
      await ProviderLiveStatus.findOneAndUpdate(
        { providerId: job.providerId },
        {
          isAvailable: true,
          currentBookingId: null
        }
      );
    }

    res.json({
      success: true,
      message: 'Job cancelled successfully'
    });

  } catch (error) {
    console.error('Customer cancel job error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ==================== GOOGLE MAPS HELPERS ====================

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

const getGoogleMapsDirections = async (originLat, originLng, destLat, destLng) => {
  try {
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&key=${GOOGLE_MAPS_API_KEY}`;

    console.log(`🌐 Getting directions from Google Maps`);

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.routes.length > 0) {
      const route = data.routes[0];
      const leg = route.legs[0];

      return {
        polyline: route.overview_polyline.points,
        distance: leg.distance.text,
        distanceValue: leg.distance.value,
        duration: leg.duration.text,
        durationValue: leg.duration.value,
        steps: leg.steps.map(step => ({
          instruction: step.html_instructions.replace(/<[^>]*>/g, ''),
          distance: step.distance.text,
          duration: step.duration.text,
          startLocation: step.start_location,
          endLocation: step.end_location
        })),
        startAddress: leg.start_address,
        endAddress: leg.end_address
      };
    }

    console.warn('⚠️ Directions API returned non-OK status:', data.status);
    return null;
  } catch (error) {
    console.error('❌ Directions API error:', error);
    return null;
  }
};





























// GET /api/customer/:bookingId/route
export const getRouteToPickup = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.id;

    console.log(`\n🔵 ===== GET ROUTE STARTED =====`);
    console.log(`📦 Booking ID: ${bookingId}`);

    // Find the job
    const job = await Job.findOne({
      bookingId,
      customerId,
      status: { $in: ['accepted', 'in_progress'] }
    });

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        message: 'No active job found with this booking ID'
      });
    }

    console.log(`✅ Job found - Status: ${job.status}`);
    console.log(`✅ Provider ID: ${job.providerId}`);

    // Get provider details from database
    const provider = await User.findById(job.providerId).select('name phone email profileImage');

    if (!provider) {
      console.log(`⚠️ Provider not found in User collection: ${job.providerId}`);
    }

    const providerStatus = await ProviderLiveStatus.findOne({
      providerId: job.providerId
    });

    if (!providerStatus?.currentLocation?.coordinates) {
      console.log(`⚠️ Provider location not available`);
      return res.status(404).json({
        error: 'Location not available',
        message: 'Provider location is not available yet'
      });
    }

    const providerLat = providerStatus.currentLocation.coordinates[1];
    const providerLng = providerStatus.currentLocation.coordinates[0];

    if (!job.bookingData?.pickup?.coordinates) {
      console.log(`⚠️ Pickup location not available`);
      return res.status(404).json({
        error: 'Pickup location not available',
        message: 'Pickup location coordinates are missing'
      });
    }

    const pickupLat = job.bookingData.pickup.coordinates.lat;
    const pickupLng = job.bookingData.pickup.coordinates.lng;

    console.log(`📍 Provider: ${providerLat}, ${providerLng}`);
    console.log(`📍 Pickup: ${pickupLat}, ${pickupLng}`);
    console.log(`👤 Provider Name: ${provider?.name || 'Unknown'}`);
    console.log(`📞 Provider Phone: ${provider?.phone || 'Unknown'}`);

    // USE GOOGLE MAPS API FOR ROUTE
    let routeData = null;
    let usingFallback = false;

    try {
      // Call Google Maps Directions API
      const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${providerLat},${providerLng}&destination=${pickupLat},${pickupLng}&key=${GOOGLE_MAPS_API_KEY}&mode=driving&alternatives=false`;

      console.log(`🔄 Calling Google Directions API...`);
      const directionsResponse = await axios.get(directionsUrl);

      if (directionsResponse.data.status === 'OK' && directionsResponse.data.routes.length > 0) {
        const route = directionsResponse.data.routes[0];
        const leg = route.legs[0];

        routeData = {
          polyline: route.overview_polyline.points,
          distance: leg.distance.text,
          distanceValue: leg.distance.value,
          eta: leg.duration.text,
          etaValue: leg.duration.value,
          startAddress: leg.start_address,
          endAddress: leg.end_address,
          steps: leg.steps.map(step => ({
            instruction: step.html_instructions.replace(/<[^>]*>/g, ''),
            distance: step.distance.text,
            duration: step.duration.text
          }))
        };

        console.log(`✅ Route found: ${routeData.distance}, ${routeData.eta}`);
      } else {
        console.log(`⚠️ Google Directions API error: ${directionsResponse.data.status}`);
        usingFallback = true;
      }
    } catch (googleError) {
      console.error(`❌ Google Maps API error:`, googleError.message);
      usingFallback = true;
    }

    // If Google API failed, use fallback calculation
    if (usingFallback) {
      console.log(`⚠️ Using fallback distance calculation`);
      const simpleDistance = calculateSimpleDistance(
        providerLat, providerLng,
        pickupLat, pickupLng
      );

      routeData = {
        polyline: null,
        distance: `${simpleDistance.toFixed(1)} km`,
        eta: `${Math.ceil(simpleDistance * 12)} min`,
        distanceValue: simpleDistance * 1000,
        etaValue: Math.ceil(simpleDistance * 12 * 60)
      };
    }

    const response = {
      success: true,
      usingFallback,
      route: {
        providerLocation: {
          latitude: providerLat,
          longitude: providerLng,
          lastUpdate: providerStatus.currentLocation.lastUpdated || new Date(),
          heading: providerStatus.heading || 0,
          speed: providerStatus.speed || 0
        },
        providerId: job.providerId, // Add provider ID
        providerName: provider?.name || 'Provider', // ✅ REAL provider name
        providerPhone: provider?.phone || '', // ✅ REAL provider phone
        providerRating: provider?.rating || 4.5, // If you have rating
        providerImage: provider?.profileImage || null, // If you have profile images
        pickupLocation: {
          latitude: pickupLat,
          longitude: pickupLng,
          address: job.bookingData.pickup.address || 'Pickup location'
        },
        polyline: routeData.polyline,
        distance: routeData.distance,
        eta: routeData.eta,
        distanceValue: routeData.distanceValue,
        etaValue: routeData.etaValue
      }
    };

    // Add dropoff location if it exists
    if (job.bookingData?.dropoff?.coordinates?.lat && job.bookingData?.dropoff?.coordinates?.lng) {
      response.route.dropoffLocation = {
        latitude: job.bookingData.dropoff.coordinates.lat,
        longitude: job.bookingData.dropoff.coordinates.lng,
        address: job.bookingData.dropoff.address || 'Dropoff location'
      };
    }

    return res.json(response);

  } catch (error) {
    console.error('❌ Get route error:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/customer/:bookingId/live-tracking
export const getLiveTracking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.id;

    console.log(`📍 Getting live tracking for booking: ${bookingId}`);

    const job = await Job.findOne({
      bookingId,
      customerId,
      status: { $in: ['accepted', 'in_progress', 'completed'] }
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get provider details
    const provider = await User.findById(job.providerId).select('name phone rating profileImage');

    const providerStatus = await ProviderLiveStatus.findOne({
      providerId: job.providerId
    });

    if (!providerStatus?.currentLocation?.coordinates) {
      return res.json({
        success: true,
        location: null,
        message: 'Provider location not available yet',
        providerName: provider?.name || 'Provider',
        providerPhone: provider?.phone || '',
        providerRating: provider?.rating || 4.5
      });
    }

    const providerLat = providerStatus.currentLocation.coordinates[1];
    const providerLng = providerStatus.currentLocation.coordinates[0];

    let eta = null;
    let distance = null;
    let etaValue = null;
    let distanceValue = null;

    if (job.bookingData?.pickup?.coordinates) {
      const pickupLat = job.bookingData.pickup.coordinates.lat;
      const pickupLng = job.bookingData.pickup.coordinates.lng;

      try {
        // Use Google Maps Distance Matrix API for real-time ETA
        const matrixUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${providerLat},${providerLng}&destinations=${pickupLat},${pickupLng}&key=${GOOGLE_MAPS_API_KEY}&mode=driving&departure_time=now`;

        const matrixResponse = await axios.get(matrixUrl);

        if (matrixResponse.data.status === 'OK' &&
          matrixResponse.data.rows[0]?.elements[0]?.status === 'OK') {
          const element = matrixResponse.data.rows[0].elements[0];

          distance = element.distance.text;
          distanceValue = element.distance.value;

          if (element.duration_in_traffic) {
            eta = element.duration_in_traffic.text;
            etaValue = element.duration_in_traffic.value;
          } else {
            eta = element.duration.text;
            etaValue = element.duration.value;
          }

          console.log(`✅ Live ETA updated: ${eta} (${distance})`);
        } else {
          // Fallback to simple calculation
          const simpleDistance = calculateSimpleDistance(
            providerLat, providerLng,
            pickupLat, pickupLng
          );

          distance = `${simpleDistance.toFixed(1)} km`;
          eta = `${Math.ceil(simpleDistance * 12)} min`;
          distanceValue = simpleDistance * 1000;
          etaValue = Math.ceil(simpleDistance * 12 * 60);
        }
      } catch (matrixError) {
        console.error(`❌ Distance Matrix API error:`, matrixError.message);
        // Fallback to simple calculation
        const simpleDistance = calculateSimpleDistance(
          providerLat, providerLng,
          pickupLat, pickupLng
        );

        distance = `${simpleDistance.toFixed(1)} km`;
        eta = `${Math.ceil(simpleDistance * 12)} min`;
        distanceValue = simpleDistance * 1000;
        etaValue = Math.ceil(simpleDistance * 12 * 60);
      }
    }

    const statusMap = {
      'accepted': 'accepted',
      'in_progress': 'started',
      'completed': 'completed'
    };

    res.json({
      success: true,
      location: {
        latitude: providerLat,
        longitude: providerLng,
        heading: providerStatus.heading || 0,
        speed: providerStatus.speed || 0,
        lastUpdate: providerStatus.currentLocation.lastUpdated || new Date()
      },
      status: statusMap[job.status] || job.status,
      eta,
      distance,
      etaValue,
      distanceValue,
      providerId: job.providerId,
      providerName: provider?.name || 'Provider', // ✅ REAL provider name
      providerPhone: provider?.phone || '', // ✅ REAL provider phone
      providerRating: provider?.rating || 4.5,
      providerImage: provider?.profileImage || null
    });

  } catch (error) {
    console.error('❌ Live tracking error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Helper function for simple distance calculation (keep as fallback)
function calculateSimpleDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}



















// ==================== CUSTOMER JOB DETAILS CONTROLLER ====================
// GET /api/customer/:bookingId/details
export const getCustomerJobDetailServiceInprogress = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.id;

    console.log(`\n🔵 ===== GET CUSTOMER JOB DETAILS STARTED =====`);
    console.log(`📦 Booking ID: ${bookingId}`);
    console.log(`👤 Customer ID: ${customerId}`);

    // Find the job and populate provider details
    const job = await Job.findOne({
      bookingId,
      customerId
    }).populate({
      path: 'providerId',
      select: 'fullName phoneNumber email profileImage rating totalJobsCompleted serviceType description'
    });

    if (!job) {
      console.log(`❌ Job not found for booking: ${bookingId}`);
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    console.log(`✅ Job found with status: ${job.status}`);

    // Get provider's live location if available
    const providerStatus = await ProviderLiveStatus.findOne({
      providerId: job.providerId
    });

    // Get real-time ETA using Google Maps if we have both locations
    let estimatedArrival = job.bookingData?.estimatedArrival || 'Calculating...';
    let distance = job.bookingData?.distance || 'Calculating...';

    if (providerStatus?.currentLocation?.coordinates && job.bookingData?.pickup?.coordinates) {
      const providerLat = providerStatus.currentLocation.coordinates[1];
      const providerLng = providerStatus.currentLocation.coordinates[0];
      const pickupLat = job.bookingData.pickup.coordinates.lat;
      const pickupLng = job.bookingData.pickup.coordinates.lng;

      try {
        const mapsData = await getGoogleMapsDistance(
          providerLat, providerLng,
          pickupLat, pickupLng
        );

        if (mapsData) {
          distance = mapsData.distance;
          estimatedArrival = mapsData.duration;
          console.log(`📍 Google Maps ETA: ${estimatedArrival}, Distance: ${distance}`);
        }
      } catch (mapsError) {
        console.error('❌ Google Maps error:', mapsError);
      }
    }

    // Prepare the response data in the format your frontend expects
    const jobData = {
      bookingId: job.bookingId,
      status: job.status,
      timeline: {
        acceptedAt: job.acceptedAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        cancelledAt: job.cancelledAt,
        cancelledBy: job.cancelledBy
      },
      provider: job.providerId ? {
        id: job.providerId._id,
        name: job.providerId.fullName || 'Provider',
        phone: job.providerId.phoneNumber || '',
        email: job.providerId.email || '',
        profileImage: job.providerId.profileImage,
        serviceType: job.providerId.serviceType || [],
        rating: job.providerId.rating || 4.5,
        totalJobsCompleted: job.providerId.totalJobsCompleted || 0,
        description: job.providerId.description || ''
      } : null,
      bookingData: {
        serviceId: job.bookingData?.serviceId,
        serviceName: job.bookingData?.serviceName || 'Service',
        servicePrice: job.bookingData?.servicePrice || 0,
        serviceCategory: job.bookingData?.serviceCategory || '',
        pickup: {
          address: job.bookingData?.pickup?.address || 'Pickup location',
          coordinates: job.bookingData?.pickup?.coordinates || { lat: 0, lng: 0 }
        },
        dropoff: job.bookingData?.dropoff ? {
          address: job.bookingData.dropoff.address,
          coordinates: job.bookingData.dropoff.coordinates
        } : undefined,
        vehicle: {
          type: job.bookingData?.vehicle?.type || '',
          makeModel: job.bookingData?.vehicle?.makeModel || '',
          year: job.bookingData?.vehicle?.year || '',
          color: job.bookingData?.vehicle?.color || '',
          licensePlate: job.bookingData?.vehicle?.licensePlate || ''
        },
        urgency: job.bookingData?.urgency || 'normal',
        issues: job.bookingData?.issues || [],
        description: job.bookingData?.description || '',
        payment: {
          totalAmount: job.bookingData?.payment?.totalAmount || 0,
          selectedTip: job.bookingData?.payment?.selectedTip || 0,
          baseServiceFee: job.bookingData?.payment?.baseServiceFee || 0
        },
        isCarRental: job.bookingData?.isCarRental || false,
        isFuelDelivery: job.bookingData?.isFuelDelivery || false,
        isSpareParts: job.bookingData?.isSpareParts || false,
        fuelType: job.bookingData?.fuelType,
        partDescription: job.bookingData?.partDescription,
        hasInsurance: job.bookingData?.hasInsurance
      },
      providerLocation: providerStatus?.currentLocation ? {
        latitude: providerStatus.currentLocation.coordinates[1],
        longitude: providerStatus.currentLocation.coordinates[0],
        heading: providerStatus.heading || 0,
        updatedAt: providerStatus.currentLocation.lastUpdated || new Date()
      } : null,
      estimatedArrival,
      distance,
      timeTracking: job.timeTracking || { totalSeconds: 0, isPaused: false },
      photos: job.photos || [],
      issues: job.issues || [],
      customerRating: job.customerRating,
      providerRating: job.providerRating,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };

    console.log(`✅ Job details prepared successfully`);
    console.log(`🔵 ===== GET CUSTOMER JOB DETAILS COMPLETED =====\n`);

    res.json({
      success: true,
      data: jobData
    });

  } catch (error) {
    console.error('❌ Get customer job details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch job details',
      error: error.message
    });
  }
};