import User from '../models/userModel.js';
import Notification from '../models/notificationModel.js';
import Job from '../models/jobModel.js';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';






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

    // Check if location already exists (optional)
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

    // Get the newly added location (last element)
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

    // Find the location
    const location = user.savedLocations.id(locationId);
    
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    // Update fields
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

    // Remove the location
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

    // Remove if already exists (to update timestamp)
    user.recentLocations = user.recentLocations.filter(
      loc => !(loc.latitude === latitude && loc.longitude === longitude)
    );

    // Add to beginning of array
    user.recentLocations.unshift({
      title,
      address,
      latitude,
      longitude,
      placeId,
      lastUsed: new Date()
    });

    // Keep only last 20 recent locations
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

// Set location as favorite
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












// Add to controllers/jobController.js - AFTER your existing code
export const getCustomerJobDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.id;

    console.log(`📋 Customer fetching job details: ${bookingId}`);

    // Find the job (must belong to this customer)
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

    // Get provider's live location
    const providerLocation = await ProviderLiveStatus.findOne({
      providerId: job.providerId
    });

    // Calculate ETA and distance using Google Maps if provider location exists
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
        
        // Call Google Maps Distance Matrix API
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${providerLat},${providerLng}&destinations=${pickupLat},${pickupLng}&key=${googleMapsApiKey}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
          // Get duration text (e.g., "15 mins")
          estimatedArrival = data.rows[0].elements[0].duration.text;
          
          // Get distance text (e.g., "2.5 km")
          distance = data.rows[0].elements[0].distance.text;
          
          console.log(`📍 Google Maps: ETA ${estimatedArrival}, Distance ${distance}`);
        }
      } catch (mapsError) {
        console.error('Google Maps API error:', mapsError);
        // Fallback to simple calculation if Google Maps fails
        const simpleDistance = calculateSimpleDistance(
          providerLat, providerLng, 
          pickupLat, pickupLng
        );
        distance = `${simpleDistance.toFixed(1)} km`;
        estimatedArrival = `${Math.ceil(simpleDistance * 12)} min`; // Assume 5 min per km
      }
    }

    // Map database status to frontend expected status
    const mapJobStatus = (dbStatus) => {
      const statusMap = {
        'accepted': 'accepted',
        'in_progress': 'started',
        'completed': 'completed',
        'cancelled': 'cancelled'
      };
      return statusMap[dbStatus] || dbStatus;
    };

    // Format response for customer view
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
      
      payment: {
        totalAmount: job.bookingData?.payment?.totalAmount || 0,
        baseFee: job.bookingData?.payment?.baseServiceFee || 0,
        tip: job.bookingData?.payment?.selectedTip || 0
      },
      
      estimatedArrival: estimatedArrival,
      distance: distance,
      createdAt: job.acceptedAt || job.createdAt
    };

    res.json({
      success: true,
      job: jobDetails
    });

  } catch (error) {
    console.error('Get customer job details error:', error);
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







export const getProviderLocationForCustomer = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.id;

    // Find the job to verify it belongs to this customer
    const job = await Job.findOne({ bookingId, customerId });
    
    if (!job || !job.providerId) {
      return res.status(404).json({
        success: false,
        message: 'Job or provider not found'
      });
    }

    // Get provider's live location
    const providerLocation = await ProviderLiveStatus.findOne({
      providerId: job.providerId
    });

    if (!providerLocation?.currentLocation?.coordinates) {
      return res.json({
        success: true,
        location: null
      });
    }

    // Also calculate updated ETA if pickup coordinates exist
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
            value: data.rows[0].elements[0].duration.value, // in seconds
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





/**
 * Get job status for customer polling
 */
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

    res.json({
      success: true,
      status: job.status,
      updatedAt: job.updatedAt
    });

  } catch (error) {
    console.error('Get job status error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Cancel job from customer side
 */
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

    // Only allow cancellation if not completed
    if (job.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel completed job'
      });
    }

    // Update job
    job.status = 'cancelled';
    job.cancelledAt = new Date();
    job.cancelledBy = 'customer';
    await job.save();

    // Make provider available again
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