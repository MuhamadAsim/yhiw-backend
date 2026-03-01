import Job from '../models/jobModel.js';
import User from '../models/userModel.js';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import mongoose from 'mongoose';
import Notification from '../models/notificationModel.js'; // Add this import


// ==================== PROVIDER JOB CONTROLLERS ====================

// Get provider's recent jobs (for home page)
export const getProviderRecentJobs = async (req, res) => {
  try {
    const { providerId } = req.params;
    const { limit = 5 } = req.query;

    // Find provider by firebaseUserId
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

    // Get recent completed jobs
    const jobs = await Job.find({
      providerId: provider._id,
      status: 'completed'
    })
    .sort({ completedAt: -1 })
    .limit(parseInt(limit))
    .select('title serviceType price completedAt customerRating');

    // Format jobs for display
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

// Get provider's job history
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

    // Build query
    const query = { providerId: provider._id };
    if (status) {
      query.status = status;
    }

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




// Get today's jobs for provider
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

    // Calculate today's stats
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




// Helper function to generate job number
const generateJobNumber = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `JOB-${year}${month}${day}-${random}`;
};


// // Controller to handle customer finding a provider
// export const findProvider = async (req, res) => {
//   try {
//     console.log('='.repeat(50));
//     console.log('🚀 FIND PROVIDER CONTROLLER STARTED');
//     console.log('='.repeat(50));

//     const {
//       pickup,
//       dropoff,
//       serviceId,
//       serviceName,
//       servicePrice,
//       serviceCategory,
//       serviceType,
//       isCarRental,
//       isFuelDelivery,
//       isSpareParts,
//       vehicle,
//       customer,
//       carRental,
//       fuelDelivery,
//       spareParts,
//       additionalDetails,
//       schedule,
//       payment,
//       locationSkipped
//     } = req.body;

//     // Get customer ID from authenticated user
//     const customerId = req.user.id;
//     console.log('Customer ID from token:', customerId);

//     if (!customerId) {
//       return res.status(401).json({
//         success: false,
//         message: 'User not authenticated properly'
//       });
//     }

//     // Generate unique job number
//     const jobNumber = generateJobNumber();
//     console.log('Generated job number:', jobNumber);

//     // Create the job in database with 'pending' status
//     const job = new Job({
//       jobNumber,
//       customerId,
      
//       title: serviceName,
//       serviceType: serviceCategory,
//       description: additionalDetails?.description || '',
      
//       price: payment?.totalAmount || parseFloat(servicePrice) || 0,
//       paymentMethod: payment?.paymentMethod || 'cash',
//       paymentStatus: 'pending',
      
//       pickupLocation: {
//         latitude: pickup?.coordinates?.lat || 0,
//         longitude: pickup?.coordinates?.lng || 0,
//         address: pickup?.address || ''
//       },
//       dropoffLocation: dropoff?.address ? {
//         latitude: dropoff?.coordinates?.lat || 0,
//         longitude: dropoff?.coordinates?.lng || 0,
//         address: dropoff?.address || ''
//       } : undefined,
      
//       status: 'pending',
//       requestedAt: new Date(),
      
//       // Store additional metadata
//       metadata: {
//         vehicle,
//         customer,
//         serviceSpecific: {
//           carRental,
//           fuelDelivery,
//           spareParts
//         },
//         additionalDetails,
//         schedule,
//         locationSkipped,
//         serviceId
//       }
//     });

//     console.log('Attempting to save job...');
//     await job.save();
//     console.log('✅ Job saved successfully with ID:', job._id);

//     // Find nearby active providers - FIXED VERSION
//     const searchRadii = [3, 5, 7]; // km
//     let eligibleProviders = [];

//     // Only search if pickup coordinates exist
//     if (pickup?.coordinates?.lat && pickup?.coordinates?.lng) {
//       for (const radius of searchRadii) {
//         if (eligibleProviders.length > 0) break;

//         console.log(`Searching for providers within ${radius}km...`);
        
//         const providers = await ProviderLiveStatus.aggregate([
//           {
//             $geoNear: {
//               near: {
//                 type: 'Point',
//                 coordinates: [pickup.coordinates.lng, pickup.coordinates.lat]
//               },
//               distanceField: 'distance',
//               maxDistance: radius * 1000,
//               spherical: true,
//               query: {
//                 isOnline: true,
//                 isAvailable: true,
//                 currentTaskId: null,
//                 lastSeen: { $gte: new Date(Date.now() - 90 * 1000) }
//               }
//             }
//           },
//           {
//             $lookup: {
//               from: 'users',
//               localField: 'providerId',
//               foreignField: '_id',
//               as: 'userInfo'
//             }
//           },
//           {
//             $unwind: {
//               path: '$userInfo',
//               preserveNullAndEmptyArrays: false
//             }
//           },
//           {
//             $match: {
//               'userInfo.status': 'active',
//               'userInfo.role': 'provider',
//               'userInfo.serviceType': { $in: [serviceCategory] }
//             }
//           },
//           {
//             $project: {
//               providerId: 1,
//               distance: 1,
//               'userInfo.fullName': 1,
//               'userInfo.firebaseUserId': 1,
//               'userInfo.rating': 1,
//               'userInfo.totalJobsCompleted': 1,
//               'userInfo.profileImage': 1,
//               'currentLocation': 1
//             }
//           },
//           {
//             $sort: { distance: 1 }
//           }
//         ]);

//         console.log(`Found ${providers.length} providers within ${radius}km`);
//         eligibleProviders = providers;
//       }
//     }

//     console.log(`Total eligible providers found: ${eligibleProviders.length}`);

//     // Create notifications for all eligible providers
//     if (eligibleProviders.length > 0) {
//       const notificationPromises = eligibleProviders.map(async (provider) => {
//         const notification = new Notification({
//           userId: provider.providerId,
//           type: 'NEW_JOB_REQUEST',
//           title: 'New Service Request',
//           message: `${serviceName} - ${pickup?.address?.substring(0, 50)}...`,
//           data: {
//             jobId: job._id.toString(),
//             jobNumber: job.jobNumber,
//             serviceType: serviceCategory,
//             serviceName: serviceName,
//             price: payment?.totalAmount || servicePrice,
//             pickupAddress: pickup?.address,
//             distance: Math.round(provider.distance / 1000 * 10) / 10, // in km with 1 decimal
//             customerName: customer?.name || 'Customer',
//             timestamp: new Date().toISOString()
//           }
//         });
        
//         return notification.save();
//       });

//       await Promise.allSettled(notificationPromises);
//       console.log(`✅ Created ${eligibleProviders.length} notifications`);
//     }

//     // Return response to customer
//     return res.status(200).json({
//       success: true,
//       message: 'Searching for providers',
//       bookingId: job._id,
//       jobNumber: job.jobNumber,
//       status: job.status,
//       providersFound: eligibleProviders.length,
//       estimatedWaitTime: eligibleProviders.length > 0 ? '30-60 seconds' : '2-3 minutes'
//     });

//   } catch (error) {
//     console.error('❌ Error in findProvider:', error);
//     console.error('Error stack:', error.stack);
    
//     if (error.name === 'ValidationError') {
//       const validationErrors = {};
//       Object.keys(error.errors).forEach(key => {
//         validationErrors[key] = error.errors[key].message;
//       });
//       return res.status(400).json({
//         success: false,
//         message: 'Validation failed',
//         errors: validationErrors
//       });
//     }

//     if (error.code === 11000) {
//       return res.status(409).json({
//         success: false,
//         message: 'Duplicate job number - please try again',
//         error: error.message
//       });
//     }

//     return res.status(500).json({
//       success: false,
//       message: 'Failed to process request',
//       error: error.message
//     });
//   }
// };



// controllers/jobController.js - Simplified findProvider for testing

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
      vehicle,
      customer,
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

    // Generate unique job number
    const jobNumber = `JOB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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
        address: pickup?.address || 'Pickup location'
      },
      dropoffLocation: dropoff?.address ? {
        latitude: dropoff?.coordinates?.lat || 0,
        longitude: dropoff?.coordinates?.lng || 0,
        address: dropoff?.address
      } : undefined,
      status: 'pending',
      requestedAt: new Date(),
      metadata: {
        vehicle,
        customer,
        additionalDetails,
        schedule,
        locationSkipped,
        serviceId
      }
    });

    console.log('Attempting to save job...');
    await job.save();
    console.log('✅ Job saved successfully with ID:', job._id);

    // SIMPLIFIED: Get ALL providers (no filters for testing)
    console.log('🔍 Getting ALL providers for testing...');
    
    // First, get all provider users
    const allProviders = await User.find({ role: 'provider' }).select('_id firebaseUserId fullName');
    console.log(`✅ Found ${allProviders.length} total providers in system`);

    // Get their live status
    const eligibleProviders = [];
    
    for (const provider of allProviders) {
      // Check if they have live status
      const liveStatus = await ProviderLiveStatus.findOne({ 
        providerId: provider._id 
      });
      
      eligibleProviders.push({
        providerId: provider._id,
        userInfo: {
          firebaseUserId: provider.firebaseUserId,
          fullName: provider.fullName,
          rating: provider.rating || 4.5,
          totalJobsCompleted: provider.totalJobsCompleted || 0,
          profileImage: provider.profileImage || ''
        },
        isOnline: liveStatus?.isOnline || false,
        isAvailable: liveStatus?.isAvailable || true,
        currentLocation: liveStatus?.currentLocation || null
      });
    }

    console.log(`✅ Found ${eligibleProviders.length} providers to notify`);

    // Prepare job data for WebSocket
    const jobRequestData = {
      jobId: job._id.toString(),
      jobNumber: job.jobNumber,
      serviceType: serviceCategory,
      serviceName: serviceName,
      price: payment?.totalAmount || servicePrice,
      pickupLocation: pickup?.address || 'Pickup location',
      dropoffLocation: dropoff?.address || null,
      customerName: customer?.name || 'Customer',
      distance: '0',
      estimatedEarnings: payment?.totalAmount || servicePrice,
      timestamp: new Date().toISOString(),
      vehicle: vehicle || {},
      additionalDetails: additionalDetails || {}
    };

    // Send via WebSocket to all providers
    const wsManager = req.app.get('wsManager');
    const providerIds = eligibleProviders
      .map(p => p.userInfo?.firebaseUserId)
      .filter(id => id); // Remove any null/undefined
    
    if (providerIds.length > 0) {
      const sentCount = wsManager.sendJobRequestToProviders(jobRequestData, providerIds);
      console.log(`📨 Sent job request to ${sentCount} providers via WebSocket`);
    }

    // Create notifications as backup
    if (eligibleProviders.length > 0) {
      console.log('📨 Creating notifications as backup...');
      
      const notificationPromises = eligibleProviders.map(async (provider) => {
        try {
          const notification = new Notification({
            userId: provider.providerId,
            type: 'NEW_JOB_REQUEST',
            title: 'New Service Request',
            message: `${serviceName} - ${pickup?.address?.substring(0, 50) || 'New job'}...`,
            data: jobRequestData
          });
          return notification.save();
        } catch (err) {
          console.log(`⚠️ Failed to create notification:`, err.message);
          return null;
        }
      });

      await Promise.allSettled(notificationPromises);
      console.log(`✅ Created notifications`);
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




// Controller for provider to get job details when they click notification
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

    // Format response for provider
    const jobDetails = {
      jobId: job._id,
      jobNumber: job.jobNumber,
      serviceType: job.serviceType,
      title: job.title,
      description: job.description,
      price: job.price,
      paymentMethod: job.paymentMethod,
      
      // Customer info
      customer: {
        name: job.customerId?.fullName || 'Customer',
        phone: job.customerId?.phoneNumber,
        rating: job.customerId?.rating || 0,
        profileImage: job.customerId?.profileImage,
        totalJobs: job.customerId?.totalJobsCompleted || 0
      },
      
      // Locations
      pickupLocation: {
        address: job.pickupLocation.address,
        coordinates: {
          lat: job.pickupLocation.latitude,
          lng: job.pickupLocation.longitude
        }
      },
      dropoffLocation: job.dropoffLocation ? {
        address: job.dropoffLocation.address,
        coordinates: {
          lat: job.dropoffLocation.latitude,
          lng: job.dropoffLocation.longitude
        }
      } : null,
      
      // Vehicle info from metadata
      vehicle: job.metadata?.vehicle || {},
      
      // Additional details
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

// controllers/jobController.js - Fixed acceptJob with complete data

export const acceptJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const providerId = req.user.id;

    console.log('='.repeat(50));
    console.log('✅ ACCEPT JOB CONTROLLER STARTED');
    console.log('Job ID:', jobId);
    console.log('Provider ID:', providerId);

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

      // Update provider status
      await ProviderLiveStatus.findOneAndUpdate(
        { providerId },
        {
          isAvailable: false,
          currentTaskId: job._id,
          lastSeen: new Date()
        },
        { session, upsert: true }
      );

      await session.commitTransaction();
      session.endSession();

      // Get provider info with all details
      const provider = await User.findById(providerId).select(
        'fullName rating profileImage firebaseUserId phoneNumber vehicleDetails'
      );

      console.log('Provider info:', provider);
      console.log('Customer firebaseUserId:', job.customerId?.firebaseUserId);
      console.log('Job details:', {
        pickupLocation: job.pickupLocation,
        dropoffLocation: job.dropoffLocation,
        metadata: job.metadata
      });

      // Get provider's current location if available
      let providerLocation = null;
      try {
        const liveStatus = await ProviderLiveStatus.findOne({ providerId });
        if (liveStatus && liveStatus.currentLocation) {
          providerLocation = {
            latitude: liveStatus.currentLocation.coordinates[1],
            longitude: liveStatus.currentLocation.coordinates[0],
            lastUpdate: liveStatus.currentLocation.lastUpdated
          };
        }
      } catch (locError) {
        console.error('Error getting provider location:', locError);
      }

      // Prepare complete data object with ALL fields the frontend expects
      const providerData = {
        // Core identifiers
        jobId: job._id.toString(),
        bookingId: job._id.toString(),
        jobNumber: job.jobNumber,
        
        // Provider info
        providerId: provider.firebaseUserId || providerId.toString(),
        providerName: provider.fullName,
        providerRating: provider.rating || 4.5,
        providerImage: provider.profileImage || '',
        providerPhone: provider.phoneNumber || '',
        
        // Service details
        serviceType: job.serviceType,
        serviceName: job.title || job.serviceType,
        serviceId: job.metadata?.serviceId,
        
        // Pickup location - CRITICAL for navigation
        pickupLocation: job.pickupLocation?.address || '',
        pickupLat: job.pickupLocation?.latitude || 0,
        pickupLng: job.pickupLocation?.longitude || 0,
        
        // Dropoff location (if available)
        dropoffLocation: job.dropoffLocation?.address || '',
        dropoffLat: job.dropoffLocation?.latitude || null,
        dropoffLng: job.dropoffLocation?.longitude || null,
        
        // Job details
        price: job.price || 0,
        estimatedEarnings: job.price || 0,
        distance: job.distance || 'Calculating...',
        urgency: job.metadata?.additionalDetails?.urgency || 'normal',
        
        // ETA and status
        estimatedArrival: '10-15 minutes',
        vehicleDetails: provider.vehicleDetails || 'Service vehicle',
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
        
        // Provider location for live tracking
        providerLocation: providerLocation,
        
        // Customer info (for reference)
        customerName: job.metadata?.customer?.name || 'Customer',
        customerPhone: job.customerId?.phoneNumber || '',
        
        // Vehicle details from metadata
        vehicleType: job.metadata?.vehicle?.type || '',
        vehicleMakeModel: job.metadata?.vehicle?.makeModel || '',
        vehicleYear: job.metadata?.vehicle?.year || '',
        vehicleColor: job.metadata?.vehicle?.color || '',
        vehicleLicensePlate: job.metadata?.vehicle?.licensePlate || '',
        
        // Additional details
        description: job.metadata?.additionalDetails?.description || '',
        
        // Metadata for reference
        metadata: job.metadata
      };

      console.log('📨 Sending to customer:', JSON.stringify(providerData, null, 2));

      // Send WebSocket notification to customer
      const wsManager = req.app.get('wsManager');
      if (job.customerId?.firebaseUserId) {
        // Send as job_accepted (primary)
        const messageData = {
          type: 'job_accepted',
          data: providerData
        };
        
        console.log('📨 Sending job_accepted message to customer:', job.customerId.firebaseUserId);
        const sent = wsManager.sendToUser(job.customerId.firebaseUserId, messageData);
        console.log('job_accepted send result:', sent ? '✅ Sent' : '❌ Failed');
        
        // Also send as provider_assigned (backup)
        const backupMessage = {
          type: 'provider_assigned',
          data: providerData
        };
        wsManager.sendToUser(job.customerId.firebaseUserId, backupMessage);
        console.log('provider_assigned backup sent');
        
        // Also send status update
        const statusMessage = {
          type: 'status_update',
          data: {
            bookingId: job._id.toString(),
            status: 'accepted',
            provider: providerData
          }
        };
        wsManager.sendToUser(job.customerId.firebaseUserId, statusMessage);
      }

      // Create notification as backup
      if (job.customerId?._id) {
        const notification = new Notification({
          userId: job.customerId._id,
          type: 'JOB_ACCEPTED',
          title: 'Provider Found!',
          message: `${provider.fullName} has accepted your request and is on the way`,
          data: providerData
        });
        await notification.save();
        console.log('✅ Backup notification created');
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
    console.error('❌ Error accepting job:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to accept job',
      error: error.message
    });
  }
};

// Controller to check job status (for customer polling)
export const checkJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    const job = await Job.findById(jobId)
      .populate('providerId', 'fullName phoneNumber rating profileImage')
      .lean();

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if user is authorized (either customer who created or assigned provider)
    if (job.customerId.toString() !== userId.toString() && 
        (!job.providerId || job.providerId._id.toString() !== userId.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    let response = {
      success: true,
      status: job.status,
      jobId: job._id,
      jobNumber: job.jobNumber
    };

    // Add provider info if assigned
    if (job.providerId && job.status !== 'pending' && job.status !== 'cancelled') {
      response.provider = {
        id: job.providerId._id,
        name: job.providerId.fullName,
        rating: job.providerId.rating,
        profileImage: job.providerId.profileImage,
        phoneNumber: job.providerId.phoneNumber
      };
      
      // Add estimated arrival if provider is en-route
      if (job.status === 'accepted' || job.status === 'en-route') {
        response.estimatedArrival = '10-15 minutes';
      }
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error checking job status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check job status',
      error: error.message
    });
  }
};