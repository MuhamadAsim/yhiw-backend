// ==================== PROVIDER CONTROLLER ====================
import User from '../models/userModel.js';
import Job from '../models/jobModel.js';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import Notification from '../models/notificationModel.js'; // Adjust path as needed
import mongoose from 'mongoose';








export const getAvailableJobs= async (req, res) => {
  try {
    const providerId = req.user.id;

    console.log('🧪 TEST MODE: Sending all available jobs without filters');

    // Simple query - only pending jobs from last 2 minutes
    const query = {
      status: 'pending',
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) } // Last 2 minutes only
    };

    // Get ALL pending jobs (no radius, no service type filter)
    const jobs = await Notification.find(query)
      .select('-viewedBy')
      .sort({ createdAt: -1 })
      .limit(50); // Increased limit for testing

    // Mark as viewed by this provider
    if (jobs.length > 0) {
      const jobIds = jobs.map(job => job._id);
      await Notification.updateMany(
        { _id: { $in: jobIds } },
        { $addToSet: { viewedBy: { providerId, viewedAt: new Date() } } }
      );
    }

    console.log(`🧪 TEST: Found ${jobs.length} jobs for provider ${providerId} (NO FILTERS APPLIED)`);

    res.json({
      success: true,
      count: jobs.length,
      mode: 'TESTING - No filters applied',
      message: 'All available jobs sent regardless of distance or service type',
      jobs
    });

  } catch (error) {
    console.error('Get available jobs test error:', error);
    res.status(500).json({ error: error.message });
  }
};







export const acceptJob = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;

    // 1. Find the notification
    const notification = await Notification.findOne({
      bookingId,
      status: 'pending'
    }).session(session);

    if (!notification) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        error: 'Job not available',
        message: 'This job has already been taken or expired'
      });
    }

    // 2. Get provider details
    const provider = await User.findById(providerId).session(session);
    if (!provider) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Provider not found' });
    }

    // 3. Create permanent job record
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
        vehicle: notification.vehicle,
        customer: {
          name: notification.customer.name,
          phone: notification.customer.phone,
          email: notification.customer?.email || req.body.email
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

    // 4. Update provider live status
    await ProviderLiveStatus.findOneAndUpdate(
      { providerId: providerId },
      {
        currentBookingId: bookingId,
        isAvailable: false,
        lastSeen: new Date()
      },
      { session, upsert: true }
    );

    // 5. Delete the notification
    await Notification.deleteOne({ _id: notification._id }).session(session);

    await session.commitTransaction();
    session.endSession();

    // 6. Get customer details
    const customer = await User.findById(notification.customerId);

    // 7. Calculate estimated arrival (example - you can implement actual logic)
    const estimatedArrival = '5-10 minutes';

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
    console.error('Accept job error:', error);
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
        firebaseUserId, // ← ADD THIS
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

    // Update provider live status with location
    const liveStatus = await ProviderLiveStatus.findOneAndUpdate(
      { providerId },
      {
        firebaseUserId, // ← ADD THIS - it's required in schema
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
          firebaseUserId // ← Include this
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






// controllers/providerController.js
export const getProviderPerformance = async (req, res) => {
  try {
    const { firebaseUserId } = req.params;
    const providerId = req.user.id;

    // Get today's jobs
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayJobs = await Job.find({
      providerId,
      acceptedAt: { $gte: today }
    });

    // Calculate totals
    const earnings = todayJobs.reduce((sum, job) => 
      sum + (job.bookingData?.payment?.totalAmount || 0), 0
    );

    const hours = todayJobs.reduce((sum, job) => {
      if (job.completedAt && job.acceptedAt) {
        const duration = (new Date(job.completedAt) - new Date(job.acceptedAt)) / (1000 * 60 * 60);
        return sum + duration;
      }
      return sum;
    }, 0);

    // Get provider rating from User model
    const provider = await User.findById(providerId);

    res.json({
      success: true,
      data: {
        earnings: earnings.toFixed(2),
        jobs: todayJobs.length,
        hours: hours.toFixed(1),
        rating: provider?.rating || 0
      }
    });
  } catch (error) {
    console.error('Get performance error:', error);
    // Return default values on error
    res.json({
      success: true,
      data: {
        earnings: 0,
        jobs: 0,
        hours: 0,
        rating: 0
      }
    });
  }
};






// controllers/providerController.js
export const getRecentJobs = async (req, res) => {
  try {
    const { firebaseUserId } = req.params;
    const providerId = req.user.id;

    const recentJobs = await Job.find({ providerId })
      .sort({ acceptedAt: -1 })
      .limit(5)
      .select('bookingData status acceptedAt completedAt');

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
      data: [] // Return empty array on error
    });
  }
};



// Helper function - define this BEFORE getRecentJobs
const formatRelativeTime = (date) => {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
  return `${Math.floor(diffMins / 1440)} days ago`;
};