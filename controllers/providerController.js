// ==================== PROVIDER CONTROLLER ====================
import User from '../models/userModel.js';
import Job from '../models/jobModel.js';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import Notification from '../models/notificationModel.js';
import mongoose from 'mongoose';

// Google Maps API helper
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const getGoogleMapsDistance = async (originLat, originLng, destLat, destLng) => {
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&key=${GOOGLE_MAPS_API_KEY}`;
    
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
    return null;
  } catch (error) {
    console.error('Google Maps API error:', error);
    return null;
  }
};

export const getAvailableJobs = async (req, res) => {
  try {
    const providerId = req.user.id;

    console.log('🧪 TEST MODE: Sending all available jobs without filters');

    const query = {
      status: 'pending',
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) }
    };

    const jobs = await Notification.find(query)
      .select('-viewedBy')
      .sort({ createdAt: -1 })
      .limit(50);

    if (jobs.length > 0) {
      const jobIds = jobs.map(job => job._id);
      await Notification.updateMany(
        { _id: { $in: jobIds } },
        { $addToSet: { viewedBy: { providerId, viewedAt: new Date() } } }
      );
    }

    console.log(`🧪 TEST: Found ${jobs.length} jobs for provider ${providerId}`);

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

    const provider = await User.findById(providerId).session(session);
    if (!provider) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Provider not found' });
    }

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
        
        // ✅ FIXED: Map vehicle correctly from Notification to Job
        vehicle: {
          type: notification.vehicle?.type?.type || '',  // Notice the nested access
          makeModel: notification.vehicle?.makeModel || '',
          year: notification.vehicle?.year || '',
          color: notification.vehicle?.color || '',
          licensePlate: notification.vehicle?.licensePlate || ''
        },
        
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

    await ProviderLiveStatus.findOneAndUpdate(
      { providerId: providerId },
      {
        currentBookingId: bookingId,
        isAvailable: false,
        lastSeen: new Date()
      },
      { session, upsert: true }
    );

    await Notification.deleteOne({ _id: notification._id }).session(session);

    await session.commitTransaction();
    session.endSession();

    const customer = await User.findById(notification.customerId);
    
    // Get provider location for ETA calculation
    const providerLocation = await ProviderLiveStatus.findOne({ providerId });
    let estimatedArrival = '5-10 minutes';
    
    if (providerLocation?.currentLocation?.coordinates && notification.pickup?.coordinates) {
      const providerLat = providerLocation.currentLocation.coordinates[1];
      const providerLng = providerLocation.currentLocation.coordinates[0];
      const pickupLat = notification.pickup.coordinates.lat;
      const pickupLng = notification.pickup.coordinates.lng;
      
      const mapsData = await getGoogleMapsDistance(
        providerLat, providerLng,
        pickupLat, pickupLng
      );
      
      if (mapsData) {
        estimatedArrival = mapsData.duration;
      }
    }

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
        firebaseUserId,
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

    const liveStatus = await ProviderLiveStatus.findOneAndUpdate(
      { providerId },
      {
        firebaseUserId,
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
          firebaseUserId
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

export const getProviderPerformance = async (req, res) => {
  try {
    const { firebaseUserId } = req.params;
    const providerId = req.user.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayJobs = await Job.find({
      providerId,
      acceptedAt: { $gte: today }
    });

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

export const getRecentJobs = async (req, res) => {
  try {
    const { firebaseUserId } = req.params;
    const providerId = req.user.id;

    const recentJobs = await Job.find({ providerId })
      .sort({ acceptedAt: -1 })
      .limit(5)
      .select('bookingData status acceptedAt completedAt');

    const formatRelativeTime = (date) => {
      const now = new Date();
      const diffMs = now - new Date(date);
      const diffMins = Math.floor(diffMs / (1000 * 60));
      
      if (diffMins < 60) return `${diffMins} min ago`;
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
      return `${Math.floor(diffMins / 1440)} days ago`;
    };

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
      data: []
    });
  }
};

export const providerCancelJob = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;
    const { reason } = req.body;

    const job = await Job.findOne({ bookingId, providerId });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel completed job' });
    }

    job.status = 'cancelled';
    job.cancelledAt = new Date();
    job.cancelledBy = 'provider';
    await job.save();

    await ProviderLiveStatus.findOneAndUpdate(
      { providerId },
      {
        isAvailable: true,
        currentBookingId: null
      }
    );

    res.json({ success: true, message: 'Job cancelled successfully' });
  } catch (error) {
    console.error('Provider cancel error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ==================== SERVICE IN PROGRESS CONTROLLERS ====================

export const getActiveJob = async (req, res) => {
  try {
    const providerId = req.user.id;
    const { bookingId } = req.params;

    const job = await Job.findOne({ 
      bookingId, 
      providerId,
      status: { $in: ['accepted', 'in_progress'] }
    }).populate('customerId', 'fullName phoneNumber');

    if (!job) {
      return res.status(404).json({ 
        error: 'Active job not found' 
      });
    }

    // Get real ETA if still en route
    let remainingEta = null;
    if (job.status === 'accepted') {
      const providerLocation = await ProviderLiveStatus.findOne({ providerId });
      
      if (providerLocation?.currentLocation?.coordinates && job.bookingData?.pickup?.coordinates) {
        const providerLat = providerLocation.currentLocation.coordinates[1];
        const providerLng = providerLocation.currentLocation.coordinates[0];
        const pickupLat = job.bookingData.pickup.coordinates.lat;
        const pickupLng = job.bookingData.pickup.coordinates.lng;
        
        const mapsData = await getGoogleMapsDistance(
          providerLat, providerLng,
          pickupLat, pickupLng
        );
        
        if (mapsData) {
          remainingEta = mapsData.duration;
        }
      }
    }

    const jobDetails = {
      bookingId: job.bookingId,
      serviceType: job.bookingData?.serviceName || 'Towing Service',
      vehicleType: job.bookingData?.vehicle?.type || 'Sedan',
      licensePlate: job.bookingData?.vehicle?.licensePlate || 'ABC 1234',
      vehicleModel: `${job.bookingData?.vehicle?.makeModel || 'Toyota Camry'} ${job.bookingData?.vehicle?.year || '2020'}`,
      customer: {
        name: job.customerId?.fullName || job.bookingData?.customer?.name || 'Mohammed A.',
        phone: job.customerId?.phoneNumber || job.bookingData?.customer?.phone || '+973 3XXX XXXX',
      },
      estimatedEarnings: job.bookingData?.payment?.totalAmount || 81,
      status: job.status,
      startedAt: job.startedAt,
      remainingEta: remainingEta,
      timeTracking: job.timeTracking || { totalSeconds: 0, isPaused: false },
      photos: job.photos || [],
      issues: job.issues || [],
      checklist: [
        'Inspect vehicle condition',
        'Secure vehicle on flatbed',
        'Document pre-service photos',
        'Check for personal items',
        'Verify drop-off location',
      ]
    };

    res.json({ 
      success: true, 
      job: jobDetails 
    });

  } catch (error) {
    console.error('Get active job error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateJobStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status, action, timeData } = req.body;
    const providerId = req.user.id;

    const updateData = {};
    
    if (status === 'in_progress' && action === 'start') {
      updateData.startedAt = new Date();
      updateData.status = 'in_progress';
      updateData['timeTracking'] = { totalSeconds: 0, isPaused: false };
    } else if (status === 'completed') {
      updateData.completedAt = new Date();
      updateData.status = 'completed';
      
      await ProviderLiveStatus.findOneAndUpdate(
        { providerId },
        { isAvailable: true, currentBookingId: null }
      );
    } else if (action === 'pause') {
      updateData['timeTracking.isPaused'] = true;
      updateData['timeTracking.pausedAt'] = new Date();
    } else if (action === 'resume') {
      updateData['timeTracking.isPaused'] = false;
    } else if (action === 'add_time' && timeData) {
      updateData.$push = { 
        'timeTracking.timeExtensions': {
          minutes: timeData.minutes,
          reason: timeData.reason,
          requestedAt: new Date()
        }
      };
    }

    const job = await Job.findOneAndUpdate(
      { bookingId, providerId },
      updateData,
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ 
      success: true, 
      message: `Job updated successfully`,
      status: job.status,
      timeTracking: job.timeTracking
    });

  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const uploadServicePhoto = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;
    const { photoType, description } = req.body;

    const job = await Job.findOne({ bookingId, providerId });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.photos) job.photos = [];
    
    job.photos.push({
      type: photoType || 'during-service',
      url: req.file?.path || 'temp-photo-url',
      description,
      uploadedAt: new Date()
    });

    await job.save();

    res.json({ 
      success: true, 
      message: 'Photo uploaded successfully',
      photos: job.photos
    });

  } catch (error) {
    console.error('Upload photo error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const reportServiceIssue = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;
    const { issueType, description, severity } = req.body;

    const job = await Job.findOne({ bookingId, providerId });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.issues) job.issues = [];
    
    const newIssue = {
      type: issueType,
      description,
      severity: severity || 'medium',
      reportedBy: 'provider',
      reportedAt: new Date(),
      status: 'open'
    };

    job.issues.push(newIssue);
    await job.save();

    res.json({ 
      success: true, 
      message: 'Issue reported successfully',
      issue: newIssue
    });

  } catch (error) {
    console.error('Report issue error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const completeService = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;
    const { 
      completionNotes, 
      checklistCompleted,
      issuesFound 
    } = req.body;

    const job = await Job.findOne({ bookingId, providerId });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    job.status = 'completed';
    job.completedAt = new Date();
    job.completionDetails = {
      notes: completionNotes,
      checklistCompleted: checklistCompleted || [],
      issuesFound: issuesFound || [],
      completedBy: providerId
    };

    await job.save();

    const providerStatus = await ProviderLiveStatus.findOneAndUpdate(
      { providerId },
      { 
        isAvailable: true, 
        currentBookingId: null
      },
      { new: true }
    );

    const totalJobsCompleted = (providerStatus?.totalJobsCompleted || 0) + 1;
    
    await ProviderLiveStatus.findOneAndUpdate(
      { providerId },
      { totalJobsCompleted }
    );

    res.json({ 
      success: true, 
      message: 'Service completed successfully',
      earnings: job.bookingData?.payment?.totalAmount,
      totalJobsCompleted
    });

  } catch (error) {
    console.error('Complete service error:', error);
    res.status(500).json({ error: error.message });
  }
};