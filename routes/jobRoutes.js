import express from 'express';
import {
  // Provider endpoints
  getProviderRecentJobs,
  getProviderJobHistory,
  getJobDetails,
  updateJobStatus,
  getTodaysJobs,
  checkJobStatus,
  getJobDetailsForProvider,
  acceptJob,
  
  // Customer endpoints
  findProvider
} from '../controllers/jobController.js';
import { authenticateToken } from '../middleware/auth.js';


const router = express.Router();

// ==================== PROVIDER JOB ROUTES ====================

// Get provider's recent jobs (for home page)
router.get('/provider/:providerId/recent', getProviderRecentJobs);

// Get provider's job history with pagination
router.get('/provider/:providerId/history', getProviderJobHistory);

// Get provider's today's jobs with stats
router.get('/provider/:providerId/today', getTodaysJobs);


// Update job status
router.put('/:jobId/status', updateJobStatus);

// ==================== CUSTOMER JOB ROUTES ====================





// ==================== COMMON JOB ROUTES ====================

// Get single job details (accessible by both provider and customer)
router.get('/:jobId', getJobDetails);


// finding provider
// Customer routes
router.post('/customer/finding-provider', authenticateToken, findProvider);
router.get('/customer/:jobId/status', authenticateToken, checkJobStatus);

// Provider routes
router.get('/provider/job/:jobId', authenticateToken, getJobDetailsForProvider);
router.post('/provider/job/:jobId/accept', authenticateToken, acceptJob);

export default router;