import express from 'express';
import {
  // Provider endpoints
  getProviderRecentJobs,
  getProviderJobHistory,
  getTodaysJobs,
  getJobDetailsForProvider,
  acceptJob,
  
  // Customer endpoints
  findProvider,
  checkJobStatus,
  
  // New provider status endpoints
  providerArrived,
  providerStartService,
  providerCompleteService,
  getJobTrackingInfo,
  providerEnRoute,
  
  // New customer rating endpoint
  submitRating
} from '../controllers/jobController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// ==================== PROVIDER JOB ROUTES ====================

// Get provider's recent jobs (for home page)
router.get('/provider/:providerId/recent', authenticateToken, getProviderRecentJobs);

// Get provider's job history with pagination
router.get('/provider/:providerId/history', authenticateToken, getProviderJobHistory);

// Get provider's today's jobs with stats
router.get('/provider/:providerId/today', authenticateToken, getTodaysJobs);

// Provider gets job details when they click notification
router.get('/provider/job/:jobId', authenticateToken, getJobDetailsForProvider);

// Provider accepts a job
router.post('/provider/job/:jobId/accept', authenticateToken, acceptJob);

// Provider declines a job (WebSocket is primary, this is fallback)
router.post('/provider/job/:jobId/decline', authenticateToken, (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'Decline received. Use WebSocket for real-time response.' 
  });
});

// Provider status update routes
router.post('/provider/job/:jobId/arrived', authenticateToken, providerArrived);
router.post('/provider/job/:jobId/start', authenticateToken, providerStartService);
router.post('/provider/job/:jobId/complete', authenticateToken, providerCompleteService);
router.post('/provider/job/:jobId/en-route', authenticateToken, providerEnRoute);

// ==================== CUSTOMER JOB ROUTES ====================

// Customer finds provider (NEW JOB CREATION)
router.post('/customer/finding-provider', authenticateToken, findProvider);

// Customer checks job status (polling fallback)
router.get('/customer/job/:jobId/status', authenticateToken, checkJobStatus);


// routes/jobRoutes.js - Add this endpoint
// Add this line to your routes
router.get('/customer/job/:jobId/track', authenticateToken, getJobTrackingInfo);

// Customer submits rating
router.post('/customer/job/:jobId/rate', authenticateToken, submitRating);

export default router;