import express from 'express';
import {
  // Provider endpoints
  getProviderRecentJobs,
  getProviderJobHistory,
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


// ==================== CUSTOMER JOB ROUTES ====================
// Customer finds provider (NEW JOB CREATION)
router.post('/customer/finding-provider', authenticateToken, findProvider);

// Customer checks job status (polling)
router.get('/customer/:jobId/status', authenticateToken, checkJobStatus);

// ==================== PROVIDER JOB ACTION ROUTES ====================
// Provider gets job details when they click notification
router.get('/provider/job/:jobId', authenticateToken, getJobDetailsForProvider);

// Provider accepts a job
router.post('/provider/job/:jobId/accept', authenticateToken, acceptJob);


export default router;