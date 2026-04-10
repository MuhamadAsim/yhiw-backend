// controllers/jobController.js
import Notification from '../models/notificationModel.js';
import Job from '../models/jobModel.js';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import User from '../models/userModel.js';
import mongoose from 'mongoose';


export const createJobNotification = async (req, res) => {
  try {
    console.log('\n🔵 ===== CREATE JOB NOTIFICATION STARTED =====');
    console.log('📥 Received Request Body:', JSON.stringify(req.body, null, 2));
    console.log('👤 User ID:', req.user.id);

    const {
      bookingId,
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
      carRental,
      fuelDelivery,
      spareParts,
      additionalDetails,
      schedule,
      payment
    } = req.body;

    // ✅ Extract schedule info
    const serviceTime = schedule?.type || 'right_now';
    const isScheduled = serviceTime === 'schedule_later';

    let scheduledAt = null;

    if (isScheduled && schedule?.scheduledDateTime) {
      const { date, timeSlot } = schedule.scheduledDateTime;

      // Combine date + timeSlot into ONE Date
      scheduledAt = new Date(`${date} ${timeSlot}`);
    }

    console.log('\n📅 SCHEDULE INFO:');
    console.log('  serviceTime:', serviceTime);
    console.log('  isScheduled:', isScheduled);
    console.log('  scheduledAt:', scheduledAt);

    // Check if notification already exists
    const existing = await Notification.findOne({ bookingId });
    if (existing) {
      console.log('❌ Booking already exists:', bookingId);
      return res.status(400).json({ error: 'Booking already exists' });
    }

    // Prepare vehicle data
    const vehicleData = {
      vehicleType: vehicle?.type || '',
      makeModel: vehicle?.makeModel || '',
      year: vehicle?.year || '',
      color: vehicle?.color || '',
      licensePlate: vehicle?.licensePlate || ''
    };

    // ✅ Prepare notification data
    const notificationData = {
      bookingId,
      customerId: req.user.id,
      serviceId,
      serviceName,
      servicePrice: parseFloat(servicePrice) || 0,
      serviceCategory,
      pickup: pickup || { address: '', coordinates: null },
      dropoff: dropoff || null,
      vehicle: vehicleData,
      customer: {
        name: customer?.name || '',
        phone: customer?.phone || ''
      },
      urgency: additionalDetails?.urgency || 'immediate',
      issues: additionalDetails?.issues || [],
      description: additionalDetails?.description || '',
      payment: payment || {
        totalAmount: 0,
        selectedTip: 0,
        baseServiceFee: parseFloat(servicePrice) || 0
      },
      isCarRental: isCarRental || false,
      isFuelDelivery: isFuelDelivery || false,
      isSpareParts: isSpareParts || false,
      fuelType: fuelDelivery?.fuelType || null,
      partDescription: spareParts?.partDescription || null,
      hasInsurance: carRental?.hasInsurance || false,

      // ✅ STATUS LOGIC FIXED
      status: isScheduled ? 'scheduled' : 'pending',

      // ✅ SCHEDULE FIELDS FIXED
      isScheduled: isScheduled,
      serviceTime: serviceTime,
      scheduledAt: scheduledAt
    };

    // ✅ Expiration logic (VERY IMPORTANT)
    if (!isScheduled) {
      notificationData.expiresAt = new Date(Date.now() + 3 * 60 * 1000);
      console.log('⏰ Immediate service - Will expire at:', notificationData.expiresAt);
    } else {
      console.log('📅 Scheduled service - No expiration (handled by cron)');
    }

    console.log('\n📦 FINAL NOTIFICATION DATA:', JSON.stringify(notificationData, null, 2));

    // Save notification
    const notification = new Notification(notificationData);
    await notification.save();

    console.log('✅ Notification saved successfully!');
    console.log('🆔 Booking ID:', notification.bookingId);
    console.log('📊 Status:', notification.status);
    console.log('📅 Is scheduled:', notification.isScheduled);

    if (!isScheduled) {
      console.log('⏱️ Will auto-delete at:', notification.expiresAt);
    } else {
      console.log('📆 Will be activated by cron at:', scheduledAt);
    }

    res.status(201).json({
      success: true,
      bookingId,
      message: isScheduled
        ? 'Service scheduled successfully'
        : 'Searching for providers...'
    });

  } catch (error) {
    console.error('\n❌ CREATE NOTIFICATION ERROR:', error);

    if (error.name === 'ValidationError') {
      console.error(
        'Validation errors:',
        Object.keys(error.errors).map(field => ({
          field,
          message: error.errors[field].message
        }))
      );
    }

    res.status(500).json({ error: error.message });
  }
};



export const checkJobStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;

    // 1. First check if job exists and get its status
    const job = await Job.findOne({ bookingId });

    if (job) {
      // Return the actual job status - could be 'accepted', 'in_progress', 'completed', etc.
      return res.json({
        status: job.status,
        completedAt: job.completedAt,
        startedAt: job.startedAt,
        cancelledAt: job.cancelledAt,
        cancelledBy: job.cancelledBy,
        cancellationReason: job.cancellationReason,
        timeTracking: job.timeTracking
      });
    }

    // 2. Check if still in notification (searching)
    const notification = await Notification.findOne({
      bookingId,
      status: 'pending'
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
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const { bookingId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      console.log(`\n🔴 ===== CANCEL JOB STARTED (Attempt ${retryCount + 1}/${maxRetries}) =====`);
      console.log(`📦 Booking ID: ${bookingId}`);
      console.log(`👤 User ID: ${userId}`);

      // Use findOneAndUpdate with optimistic concurrency control
      const activeJob = await Job.findOneAndUpdate(
        {
          bookingId,
          status: { $in: ['accepted', 'in_progress'] },
          // Add version check if you have version field (__v)
          ...(retryCount > 0 && { __v: currentVersion }) // If you track versions
        },
        {
          $set: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: reason || 'cancelled_by_user',
            cancelledBy: userId
          }
        },
        {
          new: true,
          session,
          runValidators: true
        }
      ).session(session);

      if (activeJob) {
        // Verify ownership
        if (activeJob.customerId.toString() !== userId &&
          activeJob.providerId?.toString() !== userId) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({
            error: 'Unauthorized',
            message: 'You do not have permission to cancel this job'
          });
        }

        // Update provider availability with retry logic
        if (activeJob.providerId) {
          const providerUpdate = await ProviderLiveStatus.findOneAndUpdate(
            { providerId: activeJob.providerId },
            {
              isAvailable: true,
              currentBookingId: null,
              currentJobStatus: null,
              lastSeen: new Date()
            },
            {
              session,
              new: true // Return updated document
            }
          );

          if (!providerUpdate) {
            console.log(`⚠️ Provider ${activeJob.providerId} not found in live status, creating entry`);
            await ProviderLiveStatus.create([{
              providerId: activeJob.providerId,
              isAvailable: true,
              currentBookingId: null,
              currentJobStatus: null,
              lastSeen: new Date()
            }], { session });
          }

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

      // Check for pending notification with atomic update
      const notification = await Notification.findOneAndUpdate(
        {
          bookingId,
          status: 'pending',
          // Ensure we only cancel if still pending
          $or: [
            { expiresAt: { $gt: new Date() } },
            { expiresAt: { $exists: false } }
          ]
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
          session,
          runValidators: true
        }
      );

      if (!notification) {
        // Check if job exists in terminal state
        const existingJob = await Job.findOne({
          bookingId,
          status: { $in: ['completed', 'cancelled', 'expired'] }
        }).session(session);

        if (existingJob) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            error: 'Invalid job state',
            message: `Cannot cancel job with status: ${existingJob.status}`
          });
        }

        // Check if this is a race condition (notification being processed)
        const processingNotification = await Notification.findOne({
          bookingId,
          status: { $in: ['accepted', 'processing'] }
        }).session(session);

        if (processingNotification) {
          // Race condition detected, retry
          console.log('⚠️ Race condition detected, retrying...');
          await session.abortTransaction();
          session.endSession();
          retryCount++;
          continue;
        }

        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          error: 'Booking not found',
          message: 'No active booking found with this ID'
        });
      }

      console.log(`✅ Notification cancelled successfully`);

      await session.commitTransaction();
      session.endSession();

      return res.json({
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

      // Check for write conflict error
      if (error.code === 112 || // Write conflict
        error.codeName === 'WriteConflict' ||
        error.message.includes('WriteConflict')) {

        console.log(`⚠️ Write conflict detected, retry ${retryCount + 1}/${maxRetries}`);
        retryCount++;

        if (retryCount < maxRetries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100));
          continue;
        }
      }

      console.error('❌ Cancel job error:', error);

      // Don't show raw error to customer
      return res.status(500).json({
        error: 'Unable to cancel booking',
        message: 'Please try again in a few moments'
      });
    }
  }

  // Max retries exceeded
  return res.status(503).json({
    error: 'Service temporarily unavailable',
    message: 'Unable to process cancellation due to high traffic. Please try again.'
  });
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

    // Find the job - must belong to this customer and be completed or completed_confirmed
    const job = await Job.findOne({
      bookingId,
      customerId,
      status: { $in: ['completed', 'completed_confirmed'] }
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
        status: { $in: ['completed', 'completed_confirmed'] },
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
// @route   GET /api/jobs/:bookingId/timer
export const getJobTimer = async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Find job by bookingId
    const job = await Job.findOne({ bookingId: bookingId });

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
        isPaused: job.timeTracking?.isPaused || false,
        pausedAt: job.timeTracking?.pausedAt || null,
        lastUpdated: job.timeTracking?.lastUpdated || null // Added lastUpdated
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
// @route   PATCH /api/jobs/:bookingId/timer
export const updateJobTimer = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { durationSeconds, paused, action, lastUpdated, addedMinutes } = req.body;

    // Find job by bookingId
    const job = await Job.findOne({ bookingId: bookingId });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Initialize timeTracking if it doesn't exist
    if (!job.timeTracking) {
      job.timeTracking = {
        totalSeconds: 0,
        isPaused: false,
        timeExtensions: [],
        lastUpdated: new Date()
      };
    }

    // Update time tracking
    job.timeTracking.totalSeconds = durationSeconds;
    job.timeTracking.isPaused = paused || false;

    // Update lastUpdated timestamp
    if (lastUpdated) {
      job.timeTracking.lastUpdated = new Date(lastUpdated);
    } else {
      job.timeTracking.lastUpdated = new Date();
    }

    // Update pausedAt based on action
    if (action === 'pause') {
      job.timeTracking.pausedAt = new Date();
    } else if (action === 'resume') {
      job.timeTracking.pausedAt = null;
    } else if (action === 'complete') {
      job.timeTracking.pausedAt = null;
    }

    // Handle time extension
    if (action === 'add_time' && addedMinutes) {
      job.timeTracking.timeExtensions.push({
        minutes: addedMinutes,
        reason: 'Provider added time',
        requestedAt: new Date(),
        approved: true
      });
    }

    // If starting the job (first time)
    if (action === 'start' && job.status === 'accepted') {
      job.status = 'in_progress';
      job.startedAt = new Date();
      job.timeTracking.lastUpdated = new Date();
    }

    // Handle sync action - just update without changing status
    if (action === 'sync') {
      // Just update the timer, no status change
      console.log(`Timer synced: ${durationSeconds}s for job ${bookingId}`);
    }

    await job.save();

    return res.status(200).json({
      success: true,
      message: `Timer ${action} updated successfully`,
      timer: {
        durationSeconds: job.timeTracking.totalSeconds,
        isPaused: job.timeTracking.isPaused,
        pausedAt: job.timeTracking.pausedAt,
        lastUpdated: job.timeTracking.lastUpdated
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