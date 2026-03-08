// controllers/jobController.js
import Notification from '../models/notificationModel.js';
import Job from '../models/jobModel.js';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import User from '../models/userModel.js';



export const createJobNotification = async (req, res) => {
  try {
    console.log('\n🔵 ===== CREATE JOB NOTIFICATION STARTED =====');
    console.log('📥 Received Request Body:', JSON.stringify(req.body, null, 2));
    console.log('👤 User ID:', req.user.id);

    // Get the nested data structure from frontend
    const { 
      bookingId,
      pickup,           // <-- This is an object { address, coordinates }
      dropoff,          // <-- This is an object { address, coordinates }
      serviceId,
      serviceName,
      servicePrice,
      serviceCategory,
      isCarRental,
      isFuelDelivery,
      isSpareParts,
      vehicle,          // <-- This is an object { type, makeModel, year, color, licensePlate }
      customer,         // <-- This is an object { name, phone, email, emergencyContact }
      carRental,        // <-- Optional object
      fuelDelivery,     // <-- Optional object
      spareParts,       // <-- Optional object
      additionalDetails,// <-- Object with urgency, issues, description, photos
      schedule,         // <-- Object with type, scheduledDateTime
      payment,          // <-- Object with totalAmount, selectedTip
      locationSkipped,
      timestamp,
      platform,
      version
    } = req.body;

    // Log extracted values
    console.log('\n📦 EXTRACTED VALUES:');
    console.log('  bookingId:', bookingId);
    console.log('  serviceId:', serviceId);
    console.log('  serviceName:', serviceName);
    console.log('  servicePrice:', servicePrice);
    console.log('  serviceCategory:', serviceCategory);
    
    console.log('\n📍 PICKUP DATA:');
    console.log('  pickup:', pickup);
    
    console.log('\n🚗 VEHICLE DATA (RAW):');
    console.log('  vehicle:', vehicle);
    console.log('  vehicle.type:', vehicle?.type);
    console.log('  vehicle.makeModel:', vehicle?.makeModel);
    console.log('  vehicle.year:', vehicle?.year);
    console.log('  vehicle.color:', vehicle?.color);
    console.log('  vehicle.licensePlate:', vehicle?.licensePlate);
    
    console.log('\n👤 CUSTOMER DATA:');
    console.log('  customer:', customer);
    
    console.log('\n💰 PAYMENT DATA:');
    console.log('  payment:', payment);
    
    console.log('\n🔧 ADDITIONAL DETAILS:');
    console.log('  additionalDetails:', additionalDetails);

    // Check if notification already exists
    console.log('\n🔍 Checking for existing notification with bookingId:', bookingId);
    const existing = await Notification.findOne({ bookingId });
    if (existing) {
      console.log('❌ Booking already exists:', bookingId);
      return res.status(400).json({ error: 'Booking already exists' });
    }
    console.log('✅ No existing notification found');

    // ✅ FIXED: Prepare vehicle data with vehicleType instead of nested type
    const vehicleData = {
      vehicleType: vehicle?.type || '',  // Map frontend 'type' to 'vehicleType'
      makeModel: vehicle?.makeModel || '',
      year: vehicle?.year || '',
      color: vehicle?.color || '',
      licensePlate: vehicle?.licensePlate || ''
    };
    console.log('\n🔄 PREPARED VEHICLE DATA (for schema):');
    console.log('  vehicleData:', JSON.stringify(vehicleData, null, 2));

    // Prepare notification data
    const notificationData = {
      bookingId,
      customerId: req.user.id,
      
      // Service info
      serviceId, 
      serviceName, 
      servicePrice, 
      serviceCategory,
      
      // Location data
      pickup: pickup || {
        address: '',
        coordinates: null
      },
      dropoff: dropoff || null,
      
      // ✅ FIXED: Use vehicleData with vehicleType
      vehicle: vehicleData,
      
      // Customer contact (minimal - name and phone only as per schema)
      customer: {
        name: customer?.name || '',
        phone: customer?.phone || ''
      },
      
      // Urgency and description
      urgency: additionalDetails?.urgency || 'immediate',
      issues: additionalDetails?.issues || [],
      description: additionalDetails?.description || '',
      
      // Payment info
      payment: payment || {
        totalAmount: 0,
        selectedTip: 0,
        baseServiceFee: servicePrice || 0
      },
      
      // Service-specific flags
      isCarRental: isCarRental || false,
      isFuelDelivery: isFuelDelivery || false,
      isSpareParts: isSpareParts || false,
      
      // Fuel specific
      fuelType: fuelDelivery?.fuelType || null,
      
      // Spare parts specific
      partDescription: spareParts?.partDescription || null,
      
      // Rental specific
      hasInsurance: carRental?.hasInsurance || false,
      
      // Status
      status: 'pending'
    };

    console.log('\n📦 FINAL NOTIFICATION DATA TO SAVE:');
    console.log(JSON.stringify(notificationData, null, 2));

    // Create notification with proper nested structure
    const notification = new Notification(notificationData);

    console.log('\n💾 Attempting to save notification...');
    await notification.save();
    console.log('✅ Notification saved successfully!');
    console.log('🆔 Saved notification ID:', notification._id);
    console.log('📊 Saved notification status:', notification.status);

    console.log('\n📤 SENDING RESPONSE:');
    console.log('  success: true');
    console.log('  bookingId:', bookingId);
    console.log('🔵 ===== CREATE JOB NOTIFICATION COMPLETED =====\n');

    res.status(201).json({
      success: true,
      bookingId,
      message: 'Searching for providers...'
    });

  } catch (error) {
    console.error('\n❌❌❌ CREATE NOTIFICATION ERROR ❌❌❌');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    
    if (error.name === 'ValidationError') {
      console.error('\n📋 VALIDATION ERRORS:');
      Object.keys(error.errors).forEach(field => {
        console.error(`  ${field}:`, error.errors[field].message);
        console.error(`    Value:`, error.errors[field].value);
        console.error(`    Kind:`, error.errors[field].kind);
        console.error(`    Path:`, error.errors[field].path);
      });
    }
    
    console.log('\n📤 SENDING ERROR RESPONSE');
    console.log('🔵 ===== CREATE JOB NOTIFICATION FAILED =====\n');
    
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









/**
 * Get full job details by bookingId (for providers to view before accepting)
 */
export const getJobDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;

    // First check if job exists in Notification (pending)
    let job = await Notification.findOne({ 
      bookingId,
      status: 'pending' 
    });

    if (job) {
      // Get customer details from User model
      const customer = await User.findById(job.customerId)
        .select('fullName phoneNumber rating');

      // Calculate distance from provider to pickup (if provider has location)
      let distance = '2.5 km'; // Default fallback
      
      const providerLocation = await ProviderLiveStatus.findOne({ providerId });
      
      if (providerLocation?.currentLocation?.coordinates) {
        // Calculate distance using coordinates
        // This is a simplified version - you might want to use a proper distance calculation
        const providerLng = providerLocation.currentLocation.coordinates[0];
        const providerLat = providerLocation.currentLocation.coordinates[1];
        const pickupLat = job.pickup?.coordinates?.lat;
        const pickupLng = job.pickup?.coordinates?.lng;
        
        if (pickupLat && pickupLng) {
          // Simple Euclidean distance (for demo - replace with proper geo calculation)
          const latDiff = Math.abs(providerLat - pickupLat) * 111; // 1 degree ≈ 111 km
          const lngDiff = Math.abs(providerLng - pickupLng) * 111 * Math.cos(providerLat * Math.PI / 180);
          const distInKm = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
          distance = `${distInKm.toFixed(1)} km`;
        }
      }

      // Format response for pending job
      const jobDetails = {
        bookingId: job.bookingId,
        serviceType: job.serviceName || job.serviceId,
        serviceName: job.serviceName,
        urgency: job.urgency || 'normal',
        price: job.payment?.totalAmount || 0,
        customer: {
          name: customer?.fullName || job.customer?.name || 'Customer',
          phone: customer?.phoneNumber || job.customer?.phone || '',
          rating: customer?.rating || 4.5,
        },
        vehicle: {
          type: job.vehicle?.type || 'Sedan',
          makeModel: job.vehicle?.makeModel || 'Toyota Camry',
          year: job.vehicle?.year || '2020',
          color: job.vehicle?.color || 'White',
          licensePlate: job.vehicle?.licensePlate || 'ABC 1234',
        },
        pickup: {
          address: job.pickup?.address || 'Pickup location',
          coordinates: job.pickup?.coordinates,
        },
        dropoff: job.dropoff ? {
          address: job.dropoff.address,
          coordinates: job.dropoff.coordinates,
        } : undefined,
        distance: distance,
        description: job.description,
        issues: job.issues || [],
        payment: {
          totalAmount: job.payment?.totalAmount || 0,
          baseServiceFee: job.payment?.baseServiceFee || 0,
          selectedTip: job.payment?.selectedTip || 0,
        },
        estimatedArrival: '8-10 minutes', // You can calculate based on distance
      };

      return res.json({
        success: true,
        job: jobDetails,
        status: 'pending'
      });
    }

    // If not in Notification, check if it's in Job (already accepted)
    const acceptedJob = await Job.findOne({ bookingId })
      .populate('customerId', 'fullName phoneNumber rating');

    if (acceptedJob) {
      // Job already accepted - should not happen at this stage, but handle gracefully
      return res.status(400).json({
        success: false,
        message: 'This job has already been accepted by another provider'
      });
    }

    // Not found anywhere - expired or invalid
    return res.status(404).json({
      success: false,
      message: 'Job not found or has expired'
    });

  } catch (error) {
    console.error('Get job details error:', error);
    res.status(500).json({ error: error.message });
  }
};








/**
 * Rate a completed job
 * POST /api/customer/job/:bookingId/rate
 */
export const rateCompletedJob = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.id;
    const { rating, providerId, review } = req.body;

    // Validation
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Find the job - must belong to this customer and be completed
    const job = await Job.findOne({ 
      bookingId, 
      customerId,
      status: 'completed' // Only allow rating completed jobs
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Completed job not found'
      });
    }

    // Check if already rated
    if (job.customerRating && job.customerRating.rating) {
      return res.status(400).json({
        success: false,
        message: 'You have already rated this job'
      });
    }

    // Update job with customer rating
    job.customerRating = {
      rating,
      review: review || '',
      createdAt: new Date()
    };
    
    await job.save();

    // Update provider's average rating in User model
    if (job.providerId) {
      // Get all completed jobs for this provider with ratings
      const providerJobs = await Job.find({ 
        providerId: job.providerId,
        status: 'completed',
        'customerRating.rating': { $exists: true }
      });

      // Calculate average rating
      const totalRating = providerJobs.reduce((sum, j) => 
        sum + (j.customerRating?.rating || 0), 0
      );
      const averageRating = totalRating / providerJobs.length;

      // Update provider's rating
      await User.findByIdAndUpdate(job.providerId, {
        rating: averageRating || 4.5,
        totalRatings: providerJobs.length
      });
    }

    res.json({
      success: true,
      message: 'Rating submitted successfully',
      data: {
        rating,
        averageRating: job.providerId ? 'Updated' : 'Not available'
      }
    });

  } catch (error) {
    console.error('Rate job error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};


/**
 * Get rating for a completed job
 * GET /api/customer/job/:bookingId/rating
 */
export const getJobRating = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.id;

    console.log(`📋 Fetching rating for booking: ${bookingId}`);

    // Find the job - must belong to this customer
    const job = await Job.findOne({ 
      bookingId, 
      customerId,
      status: { $in: ['completed', 'completed_confirmed'] }
    }).select('customerRating status');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Return rating if exists
    res.json({
      success: true,
      data: {
        rating: job.customerRating?.rating || null,
        review: job.customerRating?.review || null,
        ratedAt: job.customerRating?.createdAt || null,
        status: job.status
      }
    });

  } catch (error) {
    console.error('Get job rating error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};







/**
 * Complete service and finalize job
 * POST /api/provider/job/:bookingId/complete
 */
export const completeService = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;
    const { 
      notes,
      paymentReceived,
      customerConfirmed,
      completedAt,
      duration 
    } = req.body;

    console.log(`✅ Completing service for booking: ${bookingId}`);

    // Find the job - must belong to this provider and be in progress
    const job = await Job.findOne({ 
      bookingId, 
      providerId,
      status: { $in: ['accepted', 'in_progress'] } // Allow completion from either state
    });

    if (!job) {
      return res.status(404).json({ 
        success: false,
        error: 'Job not found or not in progress' 
      });
    }

    // Check if already completed
    if (job.status === 'completed') {
      return res.status(400).json({ 
        success: false,
        error: 'Job already completed' 
      });
    }

    // Validate payment confirmation
    if (!paymentReceived) {
      return res.status(400).json({ 
        success: false,
        error: 'Payment must be confirmed before completing service' 
      });
    }

    // Update job with completion details
    job.status = 'completed';
    job.completedAt = completedAt ? new Date(completedAt) : new Date();
    
    // Add completion details
    job.completionDetails = {
      notes: notes || '',
      checklistCompleted: [], // This would come from the frontend checklist
      issuesFound: [], // This would come from reported issues
      completedBy: providerId,
      paymentConfirmed: paymentReceived,
      customerConfirmed: customerConfirmed || false
    };

    // Update time tracking with final duration
    if (duration && !job.timeTracking) {
      job.timeTracking = { totalSeconds: duration, isPaused: false };
    } else if (duration && job.timeTracking) {
      job.timeTracking.totalSeconds = duration;
    }

    await job.save();

    // Update provider's live status - make available for new jobs
    await ProviderLiveStatus.findOneAndUpdate(
      { providerId },
      { 
        isAvailable: true, 
        currentBookingId: null,
        lastSeen: new Date()
      },
      { new: true }
    );

    // Increment provider's completed jobs count
    const provider = await User.findById(providerId);
    if (provider) {
      provider.completedJobs = (provider.completedJobs || 0) + 1;
      await provider.save();
    }

    // Calculate today's earnings for response
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayJobs = await Job.find({
      providerId,
      status: 'completed',
      completedAt: { $gte: today }
    });

    const todayEarnings = todayJobs.reduce((sum, j) => 
      sum + (j.bookingData?.payment?.totalAmount || 0), 0
    );

    console.log(`✅ Service completed successfully for booking: ${bookingId}`);

    res.json({
      success: true,
      message: 'Service completed successfully',
      data: {
        bookingId: job.bookingId,
        earnings: job.bookingData?.payment?.totalAmount || 0,
        completedAt: job.completedAt,
        todayEarnings,
        jobsCompletedToday: todayJobs.length
      }
    });

  } catch (error) {
    console.error('❌ Complete service error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};










