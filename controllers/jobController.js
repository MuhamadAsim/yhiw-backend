import Job from '../models/jobModel.js';
import User from '../models/userModel.js';

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

// Get single job details
export const getJobDetails = async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await Job.findById(jobId)
      .populate('customerId', 'fullName phoneNumber profileImage')
      .populate('providerId', 'fullName phoneNumber profileImage');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    res.status(200).json({
      success: true,
      data: job
    });

  } catch (error) {
    console.error('Error getting job details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get job details',
      error: error.message
    });
  }
};

// Update job status
export const updateJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status, notes } = req.body;

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Update status and corresponding timestamp
    const updates = { status };
    
    switch(status) {
      case 'accepted':
        updates.acceptedAt = new Date();
        break;
      case 'en-route':
        updates.enRouteAt = new Date();
        break;
      case 'arrived':
        updates.arrivedAt = new Date();
        break;
      case 'in-progress':
        updates.startedAt = new Date();
        break;
      case 'completed':
        updates.completedAt = new Date();
        // Calculate actual duration
        if (job.startedAt) {
          const duration = (new Date() - job.startedAt) / (1000 * 60); // in minutes
          updates.actualDuration = Math.round(duration);
        }
        break;
      case 'cancelled':
        updates.cancelledAt = new Date();
        updates.cancelledBy = 'provider';
        updates.cancellationReason = notes || 'Cancelled by provider';
        break;
    }

    if (notes && status === 'cancelled') {
      updates.cancellationReason = notes;
    } else if (notes) {
      updates.providerNotes = notes;
    }

    const updatedJob = await Job.findByIdAndUpdate(
      jobId,
      updates,
      { new: true }
    );

    // If job is completed, update provider stats
    if (status === 'completed') {
      await updateProviderStats(job.providerId, job.price);
    }

    res.status(200).json({
      success: true,
      data: updatedJob
    });

  } catch (error) {
    console.error('Error updating job status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update job status',
      error: error.message
    });
  }
};

// Accept a job
export const acceptJob = async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (job.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Job is no longer available'
      });
    }

    job.status = 'accepted';
    job.acceptedAt = new Date();
    await job.save();

    res.status(200).json({
      success: true,
      data: job
    });

  } catch (error) {
    console.error('Error accepting job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept job',
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

// ==================== CUSTOMER JOB CONTROLLERS ====================

// Create new job request
export const createJob = async (req, res) => {
  try {
    const { customerId } = req.params;
    const jobData = req.body;

    const customer = await User.findOne({ 
      firebaseUserId: customerId,
      role: 'customer' 
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const job = new Job({
      ...jobData,
      customerId: customer._id,
      requestedAt: new Date()
    });

    await job.save();

    res.status(201).json({
      success: true,
      data: job
    });

  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create job',
      error: error.message
    });
  }
};

// Get customer's job history
export const getCustomerJobs = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const customer = await User.findOne({ 
      firebaseUserId: customerId,
      role: 'customer' 
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const jobs = await Job.find({ customerId: customer._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('providerId', 'fullName profileImage rating');

    const total = await Job.countDocuments({ customerId: customer._id });

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
    console.error('Error getting customer jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get customer jobs',
      error: error.message
    });
  }
};

// Submit review for a job
export const submitJobReview = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { rating, review } = req.body;

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed jobs'
      });
    }

    job.customerRating = rating;
    job.customerReview = review;
    job.reviewSubmittedAt = new Date();
    await job.save();

    // Update provider's average rating
    await updateProviderRating(job.providerId);

    res.status(200).json({
      success: true,
      data: job
    });

  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit review',
      error: error.message
    });
  }
};

// Cancel job (by customer)
export const cancelJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { reason } = req.body;

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (!['pending', 'accepted'].includes(job.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel job at this stage'
      });
    }

    job.status = 'cancelled';
    job.cancelledAt = new Date();
    job.cancelledBy = 'customer';
    job.cancellationReason = reason || 'Cancelled by customer';
    await job.save();

    res.status(200).json({
      success: true,
      data: job
    });

  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel job',
      error: error.message
    });
  }
};

// ==================== HELPER FUNCTIONS ====================

// Update provider stats when job is completed
async function updateProviderStats(providerId, jobPrice) {
  try {
    const provider = await User.findById(providerId);
    
    if (provider) {
      provider.totalJobsCompleted = (provider.totalJobsCompleted || 0) + 1;
      provider.totalEarnings = (provider.totalEarnings || 0) + jobPrice;
      await provider.save();
    }
  } catch (error) {
    console.error('Error updating provider stats:', error);
  }
}

// Update provider's average rating
async function updateProviderRating(providerId) {
  try {
    const jobs = await Job.find({
      providerId,
      status: 'completed',
      customerRating: { $exists: true, $ne: null }
    });

    if (jobs.length > 0) {
      const totalRating = jobs.reduce((sum, job) => sum + job.customerRating, 0);
      const averageRating = totalRating / jobs.length;

      await User.findByIdAndUpdate(providerId, {
        rating: Math.round(averageRating * 10) / 10,
        totalReviews: jobs.length
      });
    }
  } catch (error) {
    console.error('Error updating provider rating:', error);
  }
}

// Helper function to format time ago
function getTimeAgo(date) {
  const now = new Date();
  const diffInMinutes = Math.floor((now - new Date(date)) / (1000 * 60));
  
  if (diffInMinutes < 60) {
    return `${diffInMinutes} MINUTE${diffInMinutes === 1 ? '' : 'S'} AGO`;
  } else if (diffInMinutes < 1440) {
    const hours = Math.floor(diffInMinutes / 60);
    return `${hours} HOUR${hours === 1 ? '' : 'S'} AGO`;
  } else {
    const days = Math.floor(diffInMinutes / 1440);
    return `${days} DAY${days === 1 ? '' : 'S'} AGO`;
  }
}