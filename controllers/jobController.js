// controllers/jobController.js
import Notification from '../models/notificationModel.js';
import Job from '../models/jobModel.js';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import User from '../models/userModel.js';






export const createJobNotification = async (req, res) => {
  try {
    const { 
      serviceId, serviceName, servicePrice, serviceCategory,
      pickupAddress, pickupLat, pickupLng,
      dropoffAddress, dropoffLat, dropoffLng,
      vehicleType, makeModel, year, color, licensePlate,
      fullName, phoneNumber, email,
      urgency, issues, description,
      totalAmount, selectedTip,
      isCarRental, isFuelDelivery, isSpareParts,
      fuelType, partDescription, hasInsurance,
      // bookingId from frontend
      bookingId 
    } = req.body;

    // Check if notification already exists (prevent duplicates)
    const existing = await Notification.findOne({ bookingId });
    if (existing) {
      return res.status(400).json({ error: 'Booking already exists' });
    }

    // Create notification
    const notification = new Notification({
      bookingId,
      customerId: req.user.id,
      serviceId, serviceName, servicePrice, serviceCategory,
      pickup: {
        address: pickupAddress,
        coordinates: { lat: pickupLat, lng: pickupLng }
      },
      dropoff: dropoffAddress ? {
        address: dropoffAddress,
        coordinates: { lat: dropoffLat, lng: dropoffLng }
      } : null,
      vehicle: {
        type: vehicleType,
        makeModel, year, color, licensePlate
      },
      customer: {
        name: fullName,
        phone: phoneNumber
      },
      urgency, issues, description,
      payment: {
        totalAmount, selectedTip, baseServiceFee: servicePrice
      },
      isCarRental, isFuelDelivery, isSpareParts,
      fuelType, partDescription, hasInsurance
    });

    await notification.save();

    // Optional: Notify nearby providers via WebSocket/push
    // findNearbyProvidersAndNotify(notification);

    res.status(201).json({
      success: true,
      bookingId,
      message: 'Searching for providers...'
    });

  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ error: error.message });
  }
};






export const checkJobStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;

    // 1. First check if job exists (accepted)
    const job = await Job.findOne({ bookingId });
    
    if (job) {
      return res.json({ status: 'accepted' });
    }

    // 2. Check if still in notification (searching)
    const notification = await Notification.findOne({ 
      bookingId,
      status: 'pending' // Only return if still pending
    });
    
    if (notification) {
      return res.json({ status: 'searching' });
    }

    // 3. Not in either - expired
    return res.json({ status: 'expired' });

  } catch (error) {
    console.error('Check status error:', error);
    res.status(500).json({ error: error.message });
  }
};





// controllers/jobController.js
export const cancelJob = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;

    // Check if job already exists (accepted)
    const job = await Job.findOne({ bookingId });
    if (job) {
      // Job already accepted - need different flow
      return res.status(400).json({ 
        error: 'Job already accepted',
        message: 'Please cancel from the tracking screen'
      });
    }

    // Delete from notification (if exists)
    const result = await Notification.deleteOne({ bookingId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel job error:', error);
    res.status(500).json({ error: error.message });
  }
};