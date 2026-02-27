import express from 'express';
import {
  // Provider endpoints
  getProviderRecentJobs,
  getProviderJobHistory,
  getJobDetails,
  updateJobStatus,
  acceptJob,
  getTodaysJobs,
  
  // Customer endpoints
  createJob,
  getCustomerJobs,
  submitJobReview,
  cancelJob
} from '../controllers/jobController.js';

const router = express.Router();

// ==================== PROVIDER JOB ROUTES ====================

// Get provider's recent jobs (for home page)
router.get('/provider/:providerId/recent', getProviderRecentJobs);

// Get provider's job history with pagination
router.get('/provider/:providerId/history', getProviderJobHistory);

// Get provider's today's jobs with stats
router.get('/provider/:providerId/today', getTodaysJobs);

// Accept a job
router.put('/:jobId/accept', acceptJob);

// Update job status
router.put('/:jobId/status', updateJobStatus);

// ==================== CUSTOMER JOB ROUTES ====================

// Create new job request
router.post('/customer/:customerId/create', createJob);

// Get customer's job history
router.get('/customer/:customerId/history', getCustomerJobs);

// Submit review for completed job
router.post('/:jobId/review', submitJobReview);

// Cancel job (by customer)
router.put('/:jobId/cancel', cancelJob);

// ==================== COMMON JOB ROUTES ====================

// Get single job details (accessible by both provider and customer)
router.get('/:jobId', getJobDetails);

export default router;