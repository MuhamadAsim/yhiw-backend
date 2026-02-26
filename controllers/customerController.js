import { mockProviders } from '../data/providers.ts';
import User from '../models/userModel.js';

// Store active bookings (in production, use database)
const activeBookings = new Map();

// Create new booking
export const createBooking = async (req, res) => {
  try {
    const bookingData = req.body;

    console.log('Received booking data:', JSON.stringify(bookingData, null, 2));

    // Validate required fields
    if (!bookingData.pickup?.address || !bookingData.customer?.name || !bookingData.customer?.phone) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: pickup address, customer name, or phone'
      });
    }

    // Validate service-specific required fields
    if (bookingData.isCarRental) {
      if (!bookingData.carRental?.licenseFront || !bookingData.carRental?.licenseBack) {
        return res.status(400).json({
          success: false,
          message: 'Car rental requires license images (front and back)'
        });
      }
    }

    if (bookingData.isFuelDelivery) {
      if (!bookingData.fuelDelivery?.fuelType) {
        return res.status(400).json({
          success: false,
          message: 'Fuel delivery requires fuel type selection'
        });
      }
    }

    if (bookingData.isSpareParts) {
      if (!bookingData.spareParts?.partDescription) {
        return res.status(400).json({
          success: false,
          message: 'Spare parts requires part description'
        });
      }
    }

    // Validate schedule for car rental
    if (bookingData.isCarRental && bookingData.schedule?.type === 'schedule_later') {
      if (!bookingData.schedule?.scheduledDateTime?.date || !bookingData.schedule?.scheduledDateTime?.timeSlot) {
        return res.status(400).json({
          success: false,
          message: 'Car rental requires scheduled date and time'
        });
      }
    }

    // Generate booking ID
    const bookingId = generateBookingId();

    // If no coordinates provided for location-based services, return error
    if (!bookingData.locationSkipped && !bookingData.pickup.coordinates) {
      return res.status(400).json({
        success: false,
        message: 'Pickup coordinates are required for this service'
      });
    }

    // Find nearby providers (skip for car rental as it's scheduled)
    let nearbyProviders = [];
    if (!bookingData.isCarRental && !bookingData.locationSkipped) {
      nearbyProviders = findNearbyProviders(
        bookingData.pickup.coordinates?.lat,
        bookingData.pickup.coordinates?.lng,
        bookingData.serviceName,
        bookingData.vehicle?.type,
        bookingData, // Pass whole booking for service-specific matching
        3 // Start with 3km radius
      );
    } else if (bookingData.isCarRental) {
      // For car rental, find providers that offer rentals regardless of distance
      nearbyProviders = findRentalProviders(bookingData);
    }

    // Store booking with all data
    const booking = {
      id: bookingId,
      ...bookingData,
      status: nearbyProviders.length > 0 ? 'searching' : 'no_providers',
      createdAt: new Date().toISOString(),
      nearbyProviders: nearbyProviders.map(p => p.id), // Store just IDs
      searchRadius: getCurrentSearchRadius(0), // Start with 3km
      searchAttempts: 0,
      providerSearchStatus: nearbyProviders.length > 0 ? 'searching' : 'failed'
    };

    activeBookings.set(bookingId, booking);

    // If no providers found at all, return no providers
    if (nearbyProviders.length === 0) {
      return res.status(200).json({
        success: true,
        bookingId,
        status: 'no_providers',
        message: bookingData.isCarRental 
          ? 'No rental providers available at this time'
          : 'No providers available in your area'
      });
    }

    // Start async provider assignment process (unless it's car rental with future date)
    if (bookingData.isCarRental && bookingData.schedule?.type === 'schedule_later') {
      // For scheduled rentals, just confirm booking without searching now
      booking.status = 'scheduled';
      activeBookings.set(bookingId, booking);
      
      return res.status(201).json({
        success: true,
        bookingId,
        status: 'scheduled',
        message: 'Rental booking created successfully'
      });
    } else {
      // Start provider search for immediate services
      assignProviderToBooking(bookingId);
    }

    return res.status(201).json({
      success: true,
      bookingId,
      status: 'pending',
      message: 'Booking created successfully, searching for providers...'
    });

  } catch (error) {
    console.error('Error creating booking:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get booking status
export const getBookingStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = activeBookings.get(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if provider has been assigned
    if (booking.providerId) {
      const provider = mockProviders.find(p => p.id === booking.providerId);
      if (provider) {
        // Calculate estimated arrival time
        const estimatedArrival = calculateEstimatedArrival(
          provider.location.lat,
          provider.location.lng,
          booking.pickup.coordinates?.lat,
          booking.pickup.coordinates?.lng
        );

        return res.status(200).json({
          success: true,
          bookingId,
          status: 'provider_assigned',
          provider: {
            id: provider.id,
            name: provider.name,
            rating: provider.rating,
            image: provider.image,
            phone: provider.phone,
            vehicleDetails: provider.vehicleType,
            licensePlate: provider.licensePlate,
            location: provider.location
          },
          estimatedArrival,
          booking: {
            id: booking.id,
            serviceName: booking.serviceName,
            serviceId: booking.serviceId,
            totalAmount: booking.payment?.totalAmount,
            pickup: booking.pickup,
            dropoff: booking.dropoff,
            schedule: booking.schedule,
            vehicle: booking.vehicle,
            customer: booking.customer
          }
        });
      }
    }

    // Check if booking has expired or no providers
    if (booking.status === 'expired') {
      return res.status(200).json({
        success: true,
        bookingId,
        status: 'expired',
        message: 'No providers available - search expired'
      });
    }

    if (booking.status === 'no_providers') {
      return res.status(200).json({
        success: true,
        bookingId,
        status: 'no_providers',
        message: 'No providers available at this time'
      });
    }

    if (booking.status === 'scheduled') {
      return res.status(200).json({
        success: true,
        bookingId,
        status: 'scheduled',
        message: 'Booking scheduled successfully',
        scheduledDateTime: booking.schedule?.scheduledDateTime
      });
    }

    // Still searching
    return res.status(200).json({
      success: true,
      bookingId,
      status: 'searching',
      searchRadius: booking.searchRadius,
      searchAttempts: booking.searchAttempts || 0,
      message: 'Searching for available providers...'
    });

  } catch (error) {
    console.error('Error getting booking status:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Cancel booking
export const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;

    const booking = activeBookings.get(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if cancellation is allowed based on time
    const now = new Date();
    const bookingTime = new Date(booking.createdAt);
    const hoursDiff = (now - bookingTime) / (1000 * 60 * 60);

    // Different cancellation policies for car rental
    if (booking.isCarRental && booking.schedule?.scheduledDateTime?.date) {
      const scheduledDate = new Date(booking.schedule.scheduledDateTime.date);
      const daysDiff = (scheduledDate - now) / (1000 * 60 * 60 * 24);
      
      if (daysDiff < 1) {
        return res.status(200).json({
          success: true,
          message: 'Booking cancelled with 50% fee (cancellation within 24 hours)',
          fee: booking.payment?.totalAmount * 0.5
        });
      }
    } else {
      // Standard service cancellation policy
      if (hoursDiff < 2) {
        // Free cancellation within 2 hours
        booking.status = 'cancelled';
        booking.cancelledAt = now.toISOString();
        booking.cancellationReason = reason || 'User cancelled';
        
        activeBookings.set(bookingId, booking);
        
        return res.status(200).json({
          success: true,
          message: 'Booking cancelled successfully - free cancellation',
          fee: 0
        });
      } else {
        // Late cancellation fee
        booking.status = 'cancelled';
        booking.cancelledAt = now.toISOString();
        booking.cancellationReason = reason || 'User cancelled late';
        
        activeBookings.set(bookingId, booking);
        
        return res.status(200).json({
          success: true,
          message: 'Booking cancelled with 50% fee (late cancellation)',
          fee: booking.payment?.totalAmount * 0.5
        });
      }
    }

    booking.status = 'cancelled';
    booking.cancelledAt = now.toISOString();
    booking.cancellationReason = reason || 'User cancelled';
    
    activeBookings.set(bookingId, booking);

    return res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling booking:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Helper function to generate booking ID
const generateBookingId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `BOK-${timestamp}-${random}`.toUpperCase();
};

// Helper function to find nearby providers with expanding radius
const findNearbyProviders = (
  pickupLat,
  pickupLng,
  serviceName,
  vehicleType,
  bookingData,
  radius = 3
) => {
  if (!pickupLat || !pickupLng) return [];

  // Filter available providers that match service and requirements
  const availableProviders = mockProviders.filter(provider => {
    // Check if provider is available
    if (provider.status !== 'available') return false;

    // Check if provider offers this service
    const serviceKey = serviceName?.toLowerCase().replace(/\s+/g, '_') || '';
    if (!provider.services?.includes(serviceKey)) return false;

    // Service-specific matching
    if (bookingData?.isCarRental) {
      // Car rental providers need to have rental vehicles available
      if (!provider.hasRentalVehicles) return false;
      
      // Check if they have the requested vehicle type
      const requestedType = bookingData.vehicle?.type;
      if (requestedType && provider.rentalVehicles && !provider.rentalVehicles.includes(requestedType)) {
        return false;
      }
    }

    if (bookingData?.isFuelDelivery) {
      // Fuel delivery providers need to have the specific fuel type
      const requestedFuel = bookingData.fuelDelivery?.fuelType;
      if (requestedFuel && provider.fuelTypes && !provider.fuelTypes.includes(requestedFuel)) {
        return false;
      }
    }

    if (bookingData?.isSpareParts) {
      // Spare parts providers need to handle parts requests
      if (!provider.supportsParts) return false;
    }

    // Vehicle type matching for towing/services
    if (vehicleType && provider.supportedVehicleTypes) {
      if (!provider.supportedVehicleTypes.includes(vehicleType)) return false;
    }

    return true;
  });

  if (availableProviders.length === 0) return [];

  // Calculate distances and filter by radius
  const providersWithDistance = availableProviders.map(provider => {
    const distance = calculateDistance(
      pickupLat,
      pickupLng,
      provider.location.lat,
      provider.location.lng
    );
    return { ...provider, distance };
  });

  // Filter by current radius
  let nearbyProviders = providersWithDistance.filter(p => p.distance <= radius);

  // If no providers found and radius less than max, try larger radius
  if (nearbyProviders.length === 0 && radius < 10) {
    const nextRadius = radius === 3 ? 5 : radius === 5 ? 7 : 10;
    return findNearbyProviders(pickupLat, pickupLng, serviceName, vehicleType, bookingData, nextRadius);
  }

  return nearbyProviders.sort((a, b) => a.distance - b.distance);
};

// Helper function to find rental providers (for scheduled rentals)
const findRentalProviders = (bookingData) => {
  return mockProviders.filter(provider => {
    if (provider.status !== 'available') return false;
    if (!provider.services?.includes('car_rental')) return false;
    if (!provider.hasRentalVehicles) return false;
    
    // Check vehicle type availability
    const requestedType = bookingData.vehicle?.type;
    if (requestedType && provider.rentalVehicles && !provider.rentalVehicles.includes(requestedType)) {
      return false;
    }
    
    return true;
  }).map(provider => ({ ...provider, distance: 0 })); // Distance doesn't matter for rentals
};

// Calculate distance between two points using Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return Math.round(distance * 10) / 10; // Round to 1 decimal
};

const deg2rad = (deg) => {
  return deg * (Math.PI / 180);
};

// Get current search radius based on attempts
const getCurrentSearchRadius = (attempts = 0) => {
  if (attempts < 3) return 3;
  if (attempts < 6) return 5;
  if (attempts < 9) return 7;
  return 10;
};

// Simulate provider assignment (async process)
const assignProviderToBooking = async (bookingId) => {
  const booking = activeBookings.get(bookingId);
  if (!booking) return;

  let attempts = 0;
  const maxAttempts = 12; // Try for ~60 seconds total
  const searchAttempts = [3, 3, 3, 5, 5, 5, 7, 7, 7, 10, 10, 10]; // Expanding radius pattern

  const searchInterval = setInterval(() => {
    if (attempts >= maxAttempts) {
      // Timeout - no providers found
      clearInterval(searchInterval);
      booking.status = 'expired';
      booking.searchEndedAt = new Date().toISOString();
      activeBookings.set(bookingId, booking);
      console.log(`Booking ${bookingId} expired - no providers found`);
      return;
    }

    const currentRadius = searchAttempts[attempts];
    attempts++;

    // Update booking with search progress
    booking.searchRadius = currentRadius;
    booking.searchAttempts = attempts;
    activeBookings.set(bookingId, booking);

    // Find providers with current radius
    const providers = findNearbyProviders(
      booking.pickup.coordinates?.lat,
      booking.pickup.coordinates?.lng,
      booking.serviceName,
      booking.vehicle?.type,
      booking, // Pass whole booking object
      currentRadius
    );

    if (providers.length > 0) {
      // Found providers! Assign the nearest available one
      const assignedProvider = providers[0]; // Nearest provider
      
      booking.providerId = assignedProvider.id;
      booking.status = 'provider_assigned';
      booking.assignedAt = new Date().toISOString();
      booking.assignedProvider = {
        id: assignedProvider.id,
        name: assignedProvider.name,
        rating: assignedProvider.rating,
        phone: assignedProvider.phone,
        vehicleDetails: assignedProvider.vehicleType,
        licensePlate: assignedProvider.licensePlate,
        estimatedArrival: calculateEstimatedArrival(
          assignedProvider.location.lat,
          assignedProvider.location.lng,
          booking.pickup.coordinates?.lat,
          booking.pickup.coordinates?.lng
        )
      };
      
      // Mark provider as busy (in real app, update in database)
      assignedProvider.status = 'busy';
      
      activeBookings.set(bookingId, booking);
      clearInterval(searchInterval);
      
      console.log(`Provider ${assignedProvider.name} assigned to booking ${bookingId}`);
    }
  }, 5000); // Check every 5 seconds
};

// Helper function to calculate estimated arrival time
const calculateEstimatedArrival = (
  providerLat,
  providerLng,
  pickupLat,
  pickupLng
) => {
  if (!providerLat || !providerLng || !pickupLat || !pickupLng) {
    return '15-20 min'; // Default estimate
  }

  const distance = calculateDistance(providerLat, providerLng, pickupLat, pickupLng);
  // Assume average speed of 40 km/h in city
  const timeInHours = distance / 40;
  const timeInMinutes = Math.ceil(timeInHours * 60);
  
  // Add 5 minutes for preparation time
  const totalMinutes = Math.min(timeInMinutes + 5, 45); // Cap at 45 minutes max
  
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  } else {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  }
};

// Get all active bookings (for admin/debugging)
export const getAllBookings = async (req, res) => {
  try {
    const bookings = Array.from(activeBookings.values());
    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (error) {
    console.error('Error getting bookings:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get booking details
export const getBookingDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = activeBookings.get(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    return res.status(200).json({
      success: true,
      booking
    });

  } catch (error) {
    console.error('Error getting booking details:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};



























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