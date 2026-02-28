// jobController.js - Cleaned up with WebSocket integration
import Job from '../models/jobModel.js';
import User from '../models/userModel.js';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import mongoose from 'mongoose';
import Notification from '../models/notificationModel.js';

// ==================== PROVIDER JOB CONTROLLERS ====================

// Get provider's recent jobs (for home page) - KEPT for initial load
export const getProviderRecentJobs = async (req, res) => {
  try {
    const { providerId } = req.params;
    const { limit = 5 } = req.query;

    const provider = await User.findOne({ 
      firebaseUserId: providerId,
      role: 'provider' 
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    const jobs = await Job.find({
      providerId: provider._id,
      status: 'completed'
    })
    .sort({ completedAt: -1 })
    .limit(parseInt(limit))
    .select('title serviceType price completedAt customerRating');

    const formattedJobs = jobs.map(job => ({
      id: job._id,
      title: job.title || job.serviceType,
      time: getTimeAgo(job.completedAt),
      price: job.price,
      status: 'COMPLETED',
      rating: job.customerRating || null
    }));

    res.status(200).json({
      success: true,
      data: formattedJobs
    });

  } catch (error) {
    console.error('Error getting recent jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recent jobs',
      error: error.message
    });
  }
};

// Get provider's job history - KEPT for history page
export const getProviderJobHistory = async (req, res) => {
  try {
    const { providerId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    const provider = await User.findOne({ 
      firebaseUserId: providerId,
      role: 'provider' 
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    const query = { providerId: provider._id };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const jobs = await Job.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('customerId', 'fullName profileImage');

    const total = await Job.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        jobs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error getting job history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get job history',
      error: error.message
    });
  }
};

// Get today's jobs for provider - KEPT for dashboard
export const getTodaysJobs = async (req, res) => {
  try {
    const { providerId } = req.params;

    const provider = await User.findOne({ 
      firebaseUserId: providerId,
      role: 'provider' 
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const jobs = await Job.find({
      providerId: provider._id,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ createdAt: -1 });

    const completedJobs = jobs.filter(job => job.status === 'completed');
    const earnings = completedJobs.reduce((sum, job) => sum + job.price, 0);
    const hours = completedJobs.reduce((sum, job) => sum + (job.actualDuration / 60), 0);

    res.status(200).json({
      success: true,
      data: {
        jobs,
        stats: {
          total: jobs.length,
          completed: completedJobs.length,
          earnings: Math.round(earnings * 100) / 100,
          hours: Math.round(hours * 10) / 10,
          pending: jobs.filter(job => job.status === 'pending').length,
          inProgress: jobs.filter(job => ['accepted', 'en-route', 'arrived', 'in-progress'].includes(job.status)).length
        }
      }
    });

  } catch (error) {
    console.error('Error getting today\'s jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get today\'s jobs',
      error: error.message
    });
  }
};

// ==================== HELPER FUNCTIONS ====================

const generateJobNumber = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `JOB-${year}${month}${day}-${random}`;
};

const getTimeAgo = (date) => {
  const now = new Date();
  const diffMinutes = Math.floor((now - new Date(date)) / 60000);
  
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hours ago`;
  return `${Math.floor(diffMinutes / 1440)} days ago`;
};

// Calculate distance between two coordinates (km)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c * 10) / 10; // Distance in km with 1 decimal
};

// ==================== CUSTOMER JOB CONTROLLERS ====================

// Main controller for customer finding a provider - UPDATED with WebSocket
export const findProvider = async (req, res) => {
  try {
    console.log('='.repeat(50));
    console.log('🚀 FIND PROVIDER CONTROLLER STARTED');
    console.log('='.repeat(50));

    const {
      pickup,
      dropoff,
      serviceId,
      serviceName,
      servicePrice,
      serviceCategory,
      serviceType,
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
      payment,
      locationSkipped
    } = req.body;

    // Get customer ID from authenticated user
    const customerId = req.user.id;
    console.log('Customer ID from token:', customerId);

    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated properly'
      });
    }

    // Get customer's firebaseUserId for WebSocket
    const customerUser = await User.findById(customerId).select('firebaseUserId');
    const customerFirebaseId = customerUser?.firebaseUserId;

    // Generate unique job number
    const jobNumber = generateJobNumber();
    console.log('Generated job number:', jobNumber);

    // Create the job in database with 'pending' status
    const job = new Job({
      jobNumber,
      customerId,
      
      title: serviceName,
      serviceType: serviceCategory,
      description: additionalDetails?.description || '',
      
      price: payment?.totalAmount || parseFloat(servicePrice) || 0,
      paymentMethod: payment?.paymentMethod || 'cash',
      paymentStatus: 'pending',
      
      pickupLocation: {
        latitude: pickup?.coordinates?.lat || 0,
        longitude: pickup?.coordinates?.lng || 0,
        address: pickup?.address || ''
      },
      dropoffLocation: dropoff?.address ? {
        latitude: dropoff?.coordinates?.lat || 0,
        longitude: dropoff?.coordinates?.lng || 0,
        address: dropoff?.address || ''
      } : undefined,
      
      status: 'pending',
      requestedAt: new Date(),
      
      // Store additional metadata
      metadata: {
        vehicle,
        customer,
        serviceSpecific: {
          carRental,
          fuelDelivery,
          spareParts
        },
        additionalDetails,
        schedule,
        locationSkipped,
        serviceId,
        urgency: additionalDetails?.urgency || 'normal'
      }
    });

    console.log('Attempting to save job...');
    await job.save();
    console.log('✅ Job saved successfully with ID:', job._id);

    // FIND NEARBY ACTIVE PROVIDERS
    console.log('🔍 Searching for providers...');
    
    const eligibleProviders = await findNearbyProviders(
      pickup?.coordinates?.lat,
      pickup?.coordinates?.lng,
      serviceCategory
    );

    console.log(`✅ Found ${eligibleProviders.length} eligible providers`);

    // Prepare job data for WebSocket
    const jobRequestData = {
      id: job._id.toString(),
      bookingId: job._id.toString(),
      jobNumber: job.jobNumber,
      serviceType: serviceCategory,
      serviceName: serviceName,
      price: payment?.totalAmount || servicePrice,
      estimatedEarnings: payment?.totalAmount || servicePrice,
      pickupLocation: pickup?.address,
      pickupLat: pickup?.coordinates?.lat,
      pickupLng: pickup?.coordinates?.lng,
      dropoffLocation: dropoff?.address,
      dropoffLat: dropoff?.coordinates?.lat,
      dropoffLng: dropoff?.coordinates?.lng,
      customerName: customer?.name || 'Customer',
      customerId: customerFirebaseId,
      distance: 'Calculating...',
      urgency: additionalDetails?.urgency || 'normal',
      timestamp: new Date().toISOString(),
      vehicleDetails: vehicle,
      description: additionalDetails?.description
    };

    // Calculate distance for each provider and send via WebSocket
    const wsManager = req.app.get('wsManager');
    let sentCount = 0;

    if (eligibleProviders.length > 0) {
      // Add distance to each provider
      const providersWithDistance = eligibleProviders.map(provider => {
        if (provider.currentLocation?.coordinates && pickup?.coordinates) {
          const distance = calculateDistance(
            pickup.coordinates.lat,
            pickup.coordinates.lng,
            provider.currentLocation.coordinates[1],
            provider.currentLocation.coordinates[0]
          );
          return {
            ...provider,
            distance: distance || 'Calculating...'
          };
        }
        return provider;
      });

      // Send job request to all eligible providers
      const providerIds = providersWithDistance.map(p => p.userInfo.firebaseUserId).filter(Boolean);
      
      if (providerIds.length > 0) {
        sentCount = wsManager.sendJobRequestToProviders({
          ...jobRequestData,
          // Add provider-specific distance when sending individually
        }, providerIds);
        
        console.log(`📨 Sent job request to ${sentCount} providers via WebSocket`);
      }

      // Create notifications as backup
      console.log('📨 Creating notifications as backup...');
      
      const notificationPromises = eligibleProviders.map(async (provider) => {
        try {
          const distance = provider.distance || 'Calculating...';
          
          const notification = new Notification({
            userId: provider.providerId,
            type: 'NEW_JOB_REQUEST',
            title: 'New Service Request',
            message: `${serviceName} - ${pickup?.address?.substring(0, 50)}...`,
            data: {
              ...jobRequestData,
              distance: distance,
              providerSpecific: {
                distance: distance,
                providerId: provider.providerId
              }
            }
          });
          
          return notification.save();
        } catch (err) {
          console.log(`⚠️ Failed to create notification:`, err.message);
          return null;
        }
      });

      await Promise.allSettled(notificationPromises);
      console.log(`✅ Created ${eligibleProviders.length} notifications`);
    }

    // Subscribe customer to job updates via WebSocket
    if (customerFirebaseId) {
      setTimeout(() => {
        wsManager.sendToUser(customerFirebaseId, {
          type: 'subscribed',
          data: { room: `job_${job._id}` }
        });
        
        // Also send initial status
        wsManager.sendToUser(customerFirebaseId, {
          type: 'status_update',
          data: {
            bookingId: job._id,
            status: 'searching',
            providersFound: eligibleProviders.length,
            timestamp: new Date().toISOString()
          }
        });
      }, 1000);
    }

    // Return response to customer
    return res.status(200).json({
      success: true,
      message: 'Searching for providers',
      bookingId: job._id,
      jobNumber: job.jobNumber,
      status: job.status,
      providersFound: eligibleProviders.length,
      estimatedWaitTime: eligibleProviders.length > 0 ? '30-60 seconds' : '2-3 minutes',
      websocketEnabled: true
    });

  } catch (error) {
    console.error('❌ Error in findProvider:', error);
    console.error('Error stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to process request',
      error: error.message
    });
  }
};

// Helper function to find nearby providers
const findNearbyProviders = async (lat, lng, serviceCategory) => {
  try {
    const searchRadii = [3, 5, 7, 10]; // km
    
    // If no coordinates, return all active providers
    if (!lat || !lng) {
      console.log('No coordinates provided, returning all active providers');
      
      const providers = await ProviderLiveStatus.aggregate([
        {
          $match: {
            isOnline: true,
            isAvailable: true,
            currentTaskId: null,
            lastSeen: { $gte: new Date(Date.now() - 2 * 60 * 1000) } // Last 2 minutes
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'providerId',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        {
          $unwind: {
            path: '$userInfo',
            preserveNullAndEmptyArrays: false
          }
        },
        {
          $match: {
            'userInfo.status': 'active',
            'userInfo.role': 'provider',
            'userInfo.serviceType': { $in: [serviceCategory] }
          }
        },
        {
          $project: {
            providerId: 1,
            'userInfo.fullName': 1,
            'userInfo.firebaseUserId': 1,
            'userInfo.rating': 1,
            'userInfo.totalJobsCompleted': 1,
            'userInfo.profileImage': 1,
            'currentLocation': 1,
            isOnline: 1,
            isAvailable: 1,
            lastSeen: 1
          }
        },
        {
          $sort: { 'userInfo.rating': -1 }
        },
        {
          $limit: 15
        }
      ]);
      
      return providers;
    }

    // Search with geospatial query
    for (const radius of searchRadii) {
      console.log(`Searching for providers within ${radius}km...`);
      
      const providers = await ProviderLiveStatus.aggregate([
        {
          $geoNear: {
            near: {
              type: 'Point',
              coordinates: [lng, lat]
            },
            distanceField: 'distance',
            maxDistance: radius * 1000,
            spherical: true,
            query: {
              isOnline: true,
              isAvailable: true,
              currentTaskId: null,
              lastSeen: { $gte: new Date(Date.now() - 2 * 60 * 1000) } // Last 2 minutes
            }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'providerId',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        {
          $unwind: {
            path: '$userInfo',
            preserveNullAndEmptyArrays: false
          }
        },
        {
          $match: {
            'userInfo.status': 'active',
            'userInfo.role': 'provider',
            'userInfo.serviceType': { $in: [serviceCategory] }
          }
        },
        {
          $project: {
            providerId: 1,
            distance: 1,
            'userInfo.fullName': 1,
            'userInfo.firebaseUserId': 1,
            'userInfo.rating': 1,
            'userInfo.totalJobsCompleted': 1,
            'userInfo.profileImage': 1,
            'currentLocation': 1,
            isOnline: 1,
            isAvailable: 1,
            lastSeen: 1
          }
        },
        {
          $sort: { distance: 1 }
        },
        {
          $limit: 10
        }
      ]);

      console.log(`Found ${providers.length} providers within ${radius}km`);
      
      if (providers.length > 0) {
        return providers;
      }
    }
    
    // If no providers found in any radius, return all active providers as fallback
    console.log('No providers found in any radius, returning all active providers');
    
    const fallbackProviders = await ProviderLiveStatus.aggregate([
      {
        $match: {
          isOnline: true,
          isAvailable: true,
          currentTaskId: null,
          lastSeen: { $gte: new Date(Date.now() - 2 * 60 * 1000) }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'providerId',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $unwind: {
          path: '$userInfo',
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $match: {
          'userInfo.status': 'active',
          'userInfo.role': 'provider',
          'userInfo.serviceType': { $in: [serviceCategory] }
        }
      },
      {
        $project: {
          providerId: 1,
          'userInfo.fullName': 1,
          'userInfo.firebaseUserId': 1,
          'userInfo.rating': 1,
          'userInfo.totalJobsCompleted': 1,
          'userInfo.profileImage': 1,
          'currentLocation': 1,
          isOnline: 1,
          isAvailable: 1,
          lastSeen: 1
        }
      },
      {
        $sort: { 'userInfo.rating': -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    return fallbackProviders;
    
  } catch (error) {
    console.error('Error finding nearby providers:', error);
    return [];
  }
};

// ==================== PROVIDER JOB ACTION CONTROLLERS ====================

// Controller for provider to get job details when they click notification - KEPT as fallback
export const getJobDetailsForProvider = async (req, res) => {
  try {
    const { jobId } = req.params;
    const providerId = req.user.id;

    const job = await Job.findById(jobId)
      .populate('customerId', 'fullName phoneNumber profileImage rating totalJobsCompleted')
      .lean();

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if job is still available (pending and not assigned)
    if (job.status !== 'pending' || job.providerId) {
      return res.status(400).json({
        success: false,
        message: 'This job is no longer available',
        status: job.status
      });
    }

    // Calculate distance from provider to pickup
    let distance = 'Calculating...';
    const providerLocation = await ProviderLiveStatus.findOne({ providerId });
    
    if (providerLocation?.currentLocation?.coordinates && job.pickupLocation) {
      const dist = calculateDistance(
        job.pickupLocation.latitude,
        job.pickupLocation.longitude,
        providerLocation.currentLocation.coordinates[1],
        providerLocation.currentLocation.coordinates[0]
      );
      if (dist) distance = `${dist} km`;
    }

    // Format response for provider
    const jobDetails = {
      jobId: job._id,
      bookingId: job._id,
      jobNumber: job.jobNumber,
      serviceType: job.serviceType,
      title: job.title,
      description: job.description,
      price: job.price,
      estimatedEarnings: job.price,
      paymentMethod: job.paymentMethod,
      distance: distance,
      
      // Customer info
      customer: {
        name: job.customerId?.fullName || 'Customer',
        phone: job.customerId?.phoneNumber,
        rating: job.customerId?.rating || 0,
        profileImage: job.customerId?.profileImage,
        totalJobs: job.customerId?.totalJobsCompleted || 0
      },
      
      // Locations
      pickupLocation: job.pickupLocation.address,
      pickupLat: job.pickupLocation.latitude,
      pickupLng: job.pickupLocation.longitude,
      dropoffLocation: job.dropoffLocation?.address,
      dropoffLat: job.dropoffLocation?.latitude,
      dropoffLng: job.dropoffLocation?.longitude,
      
      // Vehicle info from metadata
      vehicle: job.metadata?.vehicle || {},
      
      // Additional details
      urgency: job.metadata?.additionalDetails?.urgency || 'normal',
      additionalInfo: job.metadata?.additionalDetails || {},
      
      // Timeline
      requestedAt: job.requestedAt
    };

    return res.status(200).json({
      success: true,
      data: jobDetails
    });

  } catch (error) {
    console.error('Error getting job details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get job details',
      error: error.message
    });
  }
};

// Accept job controller - UPDATED with WebSocket notification
export const acceptJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const providerId = req.user.id;

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find and update job - only if still pending
      const job = await Job.findByIdAndUpdate(
        jobId,
        {
          providerId,
          status: 'accepted',
          acceptedAt: new Date()
        },
        { 
          new: true,
          session,
          runValidators: true 
        }
      ).populate('customerId', 'firebaseUserId fullName phoneNumber');

      if (!job) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }

      // Check if job was already taken
      if (job.providerId && job.providerId.toString() !== providerId.toString()) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'This job has already been accepted by another provider'
        });
      }

      // Update provider status to unavailable
      await ProviderLiveStatus.findOneAndUpdate(
        { providerId },
        {
          isAvailable: false,
          currentTaskId: job._id,
          lastSeen: new Date()
        },
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      // Get provider info
      const provider = await User.findById(providerId).select('fullName rating profileImage firebaseUserId');

      // Send WebSocket notifications
      const wsManager = req.app.get('wsManager');
      
      // 1. Notify customer
      if (job.customerId?.firebaseUserId) {
        wsManager.sendToUser(job.customerId.firebaseUserId, {
          type: 'provider_assigned',
          data: {
            jobId: job._id.toString(),
            bookingId: job._id.toString(),
            jobNumber: job.jobNumber,
            providerName: provider.fullName,
            providerRating: provider.rating,
            providerImage: provider.profileImage,
            estimatedArrival: '10-15 minutes',
            status: 'accepted'
          }
        });
      }

      // 2. Notify all other providers that this job is taken
      wsManager.broadcastToRoom(`job_${job._id}_viewers`, {
        type: 'job_taken',
        data: {
          jobId: job._id.toString(),
          providerId: provider.firebaseUserId
        }
      });

      // Create notification as backup
      if (job.customerId?._id) {
        const notification = new Notification({
          userId: job.customerId._id,
          type: 'JOB_ACCEPTED',
          title: 'Provider Found!',
          message: `${provider.fullName} has accepted your request and is on the way`,
          data: {
            jobId: job._id.toString(),
            jobNumber: job.jobNumber,
            providerId: providerId.toString(),
            providerName: provider.fullName,
            status: 'accepted'
          }
        });
        await notification.save();
      }

      return res.status(200).json({
        success: true,
        message: 'Job accepted successfully',
        data: {
          jobId: job._id,
          jobNumber: job.jobNumber,
          status: job.status,
          customerLocation: job.pickupLocation,
          customerPhone: job.customerId?.phoneNumber
        }
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

  } catch (error) {
    console.error('Error accepting job:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to accept job',
      error: error.message
    });
  }
};


export const declineJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const providerId = req.user.id;
    
    // Just log the decline, no need to update job
    console.log(`Provider ${providerId} declined job ${jobId}`);
    
    // Notify via WebSocket
    const wsManager = req.app.get('wsManager');
    wsManager.broadcastToRoom(`job_${jobId}`, {
      type: 'job_declined',
      data: {
        jobId,
        providerId
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Job declined'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== REMOVED CONTROLLERS ====================
// The following controllers have been removed as they're replaced by WebSocket:
// - checkJobStatus (polling) - replaced by WebSocket status updates