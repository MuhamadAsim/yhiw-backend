import express from 'express';
import {
  // Provider endpoints
  getProviderRecentJobs,
  getProviderJobHistory,
  getTodaysJobs,
  getJobDetailsForProvider,
  acceptJob,
  
  // Customer endpoints
  findProvider
} from '../controllers/jobController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// ==================== PROVIDER JOB ROUTES ====================

// Get provider's recent jobs (for home page) - REST fallback
router.get('/provider/:providerId/recent', authenticateToken, getProviderRecentJobs);

// Get provider's job history with pagination - REST only (no real-time needed)
router.get('/provider/:providerId/history', authenticateToken, getProviderJobHistory);

// Get provider's today's jobs with stats - REST fallback
router.get('/provider/:providerId/today', authenticateToken, getTodaysJobs);


// ==================== CUSTOMER JOB ROUTES ====================
// Customer finds provider (NEW JOB CREATION) - This triggers WebSocket broadcast
router.post('/customer/finding-provider', authenticateToken, findProvider);


// ==================== PROVIDER JOB ACTION ROUTES ====================
// Provider gets job details when they click notification - REST fallback
router.get('/provider/job/:jobId', authenticateToken, getJobDetailsForProvider);

// Provider accepts a job - REST fallback if WebSocket fails
router.post('/provider/job/:jobId/accept', authenticateToken, acceptJob);

// Optional: Provider declines a job - for REST fallback
router.post('/provider/job/:jobId/decline', authenticateToken, (req, res) => {
  // You might want to add this for completeness
  res.status(501).json({ success: false, message: 'Use WebSocket for real-time response' });
});


export default router;