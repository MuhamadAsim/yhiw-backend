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






// // controllers/jobController.js
// export const cancelJob = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { bookingId } = req.params;
//     const { reason } = req.body;

//     console.log(`\n🔴 ===== CANCEL JOB STARTED =====`);
//     console.log(`📦 Booking ID: ${bookingId}`);

//     // Try to cancel notification first (atomic operation)
//     const notification = await Notification.findOneAndUpdate(
//       { bookingId, status: 'pending' },
//       { 
//         $set: { 
//           status: 'cancelled', 
//           cancelledAt: new Date(),
//           cancellationReason: reason || 'cancelled_by_customer'
//         } 
//       },
//       { session, new: true }
//     );

//     if (notification) {
//       console.log(`✅ Notification cancelled successfully`);
//       await session.commitTransaction();
//       session.endSession();
//       return res.json({
//         success: true,
//         message: 'Booking cancelled successfully'
//       });
//     }

//     // If no notification, check for active job
//     const job = await Job.findOne({ bookingId }).session(session);
    
//     if (!job) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json({ error: 'Booking not found' });
//     }

//     // Check if job can be cancelled
//     if (!['accepted', 'in_progress'].includes(job.status)) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json({ 
//         error: 'Cannot cancel',
//         message: `Job cannot be cancelled in ${job.status} state`
//       });
//     }

//     // Update job status
//     job.status = 'cancelled';
//     job.cancelledAt = new Date();
//     job.cancellationReason = reason || 'cancelled_by_customer';
//     await job.save({ session });

//     // Update provider availability if exists
//     if (job.providerId) {
//       await ProviderLiveStatus.findOneAndUpdate(
//         { providerId: job.providerId },
//         {
//           isAvailable: true,
//           currentBookingId: null,
//           currentJobStatus: null
//         },
//         { session }
//       );
//     }

//     await session.commitTransaction();
//     session.endSession();

//     res.json({
//       success: true,
//       message: 'Job cancelled successfully'
//     });

//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     console.error('Cancel job error:', error);
//     res.status(500).json({ error: error.message });
//   }
// };





// controllers/jobController.js
export const cancelJob = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { bookingId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id; // Assuming auth middleware sets this

    console.log(`\n🔴 ===== CANCEL JOB STARTED =====`);
    console.log(`📦 Booking ID: ${bookingId}`);
    console.log(`👤 User ID: ${userId}`);
    console.log(`📝 Reason: ${reason || 'No reason provided'}`);

    // ✅ CHECK 1: First check if there's an active job (accepted/in_progress)
    const activeJob = await Job.findOne({ 
      bookingId,
      status: { $in: ['accepted', 'in_progress'] }
    }).session(session);

    if (activeJob) {
      console.log(`📋 Active job found with status: ${activeJob.status}`);
      
      // Verify this user owns the job (either as customer or provider)
      if (activeJob.customerId.toString() !== userId && 
          activeJob.providerId?.toString() !== userId) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ 
          error: 'Unauthorized',
          message: 'You do not have permission to cancel this job'
        });
      }

      // Update job status to cancelled
      activeJob.status = 'cancelled';
      activeJob.cancelledAt = new Date();
      activeJob.cancellationReason = reason || 'cancelled_by_user';
      activeJob.cancelledBy = userId;
      await activeJob.save({ session });

      // If there's a provider assigned, update their availability
      if (activeJob.providerId) {
        await ProviderLiveStatus.findOneAndUpdate(
          { providerId: activeJob.providerId },
          {
            isAvailable: true,
            currentBookingId: null,
            currentJobStatus: null,
            lastSeen: new Date()
          },
          { session }
        );
        console.log(`✅ Provider ${activeJob.providerId} marked as available`);
      }

      await session.commitTransaction();
      session.endSession();

      return res.json({
        success: true,
        message: 'Job cancelled successfully',
        data: {
          bookingId,
          status: 'cancelled',
          cancelledAt: activeJob.cancelledAt
        }
      });
    }

    // ✅ CHECK 2: Check for pending notification
    const notification = await Notification.findOneAndUpdate(
      { 
        bookingId, 
        status: 'pending' 
      },
      { 
        $set: { 
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason || 'cancelled_by_customer'
        } 
      },
      { 
        new: true,
        session 
      }
    );

    if (!notification) {
      // Double-check if job exists in any other state
      const otherJob = await Job.findOne({ bookingId }).session(session);
      
      if (otherJob) {
        // Job exists but in different state (completed, cancelled, etc)
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          error: 'Invalid job state',
          message: `Cannot cancel job with status: ${otherJob.status}`
        });
      }

      // No job and no notification found
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ 
        error: 'Booking not found',
        message: 'No booking found with this ID'
      });
    }

    console.log(`✅ Notification cancelled successfully`);

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        bookingId,
        status: 'cancelled',
        cancelledAt: new Date()
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('❌ Cancel job error:', error);
    res.status(500).json({ 
      error: 'Failed to cancel job',
      message: error.message 
    });
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








// @desc    Get timer data for a job
// @route   GET /api/provider/job/:bookingId/timer
export const getJobTimer = async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Find job by bookingId only - no provider verification
    const job = await Job.findOne({ 
      bookingId: bookingId
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    return res.status(200).json({
      success: true,
      timer: {
        durationSeconds: job.timeTracking?.totalSeconds || 0,
        isPaused: job.timeTracking?.isPaused || false, // Note: using isPaused consistently
        pausedAt: job.timeTracking?.pausedAt || null
      }
    });

  } catch (error) {
    console.error('Error fetching job timer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch timer data'
    });
  }
};

// @desc    Update timer data for a job
// @route   PATCH /api/provider/:bookingId/timer
export const updateJobTimer = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { durationSeconds, paused, action } = req.body;

    // Find job by bookingId only - no provider verification
    const job = await Job.findOne({ 
      bookingId: bookingId
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Initialize timeTracking if it doesn't exist
    if (!job.timeTracking) {
      job.timeTracking = {};
    }

    // Update time tracking
    job.timeTracking.totalSeconds = durationSeconds;
    job.timeTracking.isPaused = paused || false;

    // Update pausedAt based on action
    if (action === 'pause') {
      job.timeTracking.pausedAt = new Date();
    } else if (action === 'resume') {
      job.timeTracking.pausedAt = null;
    } else if (action === 'complete') {
      // Just save the final time, no status change needed here
      job.timeTracking.completedAt = new Date();
    }

    // If starting the job (first time)
    if (action === 'start' && job.status === 'accepted') {
      job.status = 'in_progress';
      job.startedAt = new Date();
    }

    await job.save();

    return res.status(200).json({
      success: true,
      message: `Timer ${action} updated successfully`,
      timer: {
        durationSeconds: job.timeTracking.totalSeconds,
        isPaused: job.timeTracking.isPaused,
        pausedAt: job.timeTracking.pausedAt
      }
    });

  } catch (error) {
    console.error('Error updating job timer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update timer'
    });
  }
};