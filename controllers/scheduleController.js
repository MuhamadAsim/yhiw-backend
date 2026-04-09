import ScheduledBooking from '../models/scheduleModel.js';
import User from '../models/userModel.js';
import { v4 as uuidv4 } from 'uuid';

// POST /api/schedule — Create a scheduled booking
export const createScheduledBooking = async (req, res) => {
  try {
    const {
      userId,
      serviceId, serviceName, serviceCategory,
      basePrice, totalAmount, tip,
      pickupAddress, pickupLat, pickupLng,
      dropoffAddress, dropoffLat, dropoffLng,
      waypoints, locationSkipped,
      serviceTime, scheduledDate, scheduledTimeSlot,
      vehicleType, makeModel, year, color, licensePlate,
      fullName, phoneNumber, email, emergencyContact,
      licenseFront, licenseBack,
      fuelType, partDescription,
      urgency, issues, description,
      hasInsurance, needSpecificTruck, hasModifications, needMultilingual,
      paymentMethod, paymentStatus,
    } = req.body;

    // Basic validation
    if (!userId || !serviceId || !scheduledDate || !scheduledTimeSlot) {
      return res.status(400).json({
        success: false,
        message: 'userId, serviceId, scheduledDate and scheduledTimeSlot are required',
      });
    }

    // Make sure user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Don't allow scheduling in the past
    const scheduled = new Date(scheduledDate);
    if (scheduled < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Scheduled date cannot be in the past',
      });
    }

    // Generate unique booking ID
    const bookingId = `SCH-${uuidv4().split('-')[0].toUpperCase()}`;

    const scheduledBooking = new ScheduledBooking({
      userId,
      bookingId,
      serviceId,
      serviceName,
      serviceCategory,
      basePrice,
      totalAmount,
      tip: tip || 0,

      serviceTime,
      scheduledDate: scheduled,
      scheduledTimeSlot,

      pickup: {
        address: pickupAddress,
        lat: pickupLat ? parseFloat(pickupLat) : null,
        lng: pickupLng ? parseFloat(pickupLng) : null,
      },
      dropoff: {
        address: dropoffAddress || null,
        lat: dropoffLat ? parseFloat(dropoffLat) : null,
        lng: dropoffLng ? parseFloat(dropoffLng) : null,
      },
      waypoints: waypoints || [],
      locationSkipped: locationSkipped || false,

      vehicle: {
        type: vehicleType,
        makeModel,
        year,
        color,
        licensePlate,
      },

      contact: {
        fullName,
        phoneNumber,
        email,
        emergencyContact,
      },

      urgency: urgency || 'moderate',
      issues: issues || [],
      description,
      hasInsurance: hasInsurance || false,
      needSpecificTruck: needSpecificTruck || false,
      hasModifications: hasModifications || false,
      needMultilingual: needMultilingual || false,

      fuelType,
      partDescription,
      licenseFront,
      licenseBack,

      paymentMethod: paymentMethod || 'cash',
      paymentStatus: paymentStatus || 'pending',

      status: 'pending',
    });

    await scheduledBooking.save();

    console.log(`✅ Scheduled booking created: ${bookingId} for user ${userId}`);

    return res.status(201).json({
      success: true,
      message: 'Booking scheduled successfully',
      bookingId,
      data: scheduledBooking,
    });

  } catch (error) {
    console.error('Error creating scheduled booking:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/schedule/user/:userId — Get all scheduled bookings for a user
export const getUserScheduledBookings = async (req, res) => {
  try {
    const { userId } = req.params;

    const bookings = await ScheduledBooking.find({ userId })
      .sort({ scheduledDate: 1 })
      .select('-licenseFront -licenseBack'); // don't expose license images in list

    return res.status(200).json({ success: true, data: bookings });

  } catch (error) {
    console.error('Error fetching scheduled bookings:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/schedule/:bookingId — Get single scheduled booking
export const getScheduledBookingById = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await ScheduledBooking.findOne({ bookingId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    return res.status(200).json({ success: true, data: booking });

  } catch (error) {
    console.error('Error fetching scheduled booking:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/schedule/:bookingId — Cancel a scheduled booking
export const cancelScheduledBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;

    const booking = await ScheduledBooking.findOne({ bookingId });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (['cancelled', 'completed', 'in_progress'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a booking with status: ${booking.status}`,
      });
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancelledBy = 'customer';
    booking.cancellationReason = reason || 'Cancelled by customer';
    await booking.save();

    return res.status(200).json({ success: true, message: 'Booking cancelled successfully' });

  } catch (error) {
    console.error('Error cancelling scheduled booking:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};