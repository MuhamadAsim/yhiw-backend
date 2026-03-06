// routes/providerRoutes.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  // Existing imports
  getAvailableJobs,
  acceptJob,
  updateProviderStatus,
  updateProviderLocation,
  getProviderStatus,
  getProviderPerformance,
  getRecentJobs,
  providerCancelJob,
  
  // NEW: Service In Progress controllers
  getActiveJob,
  updateJobStatus,
  uploadServicePhoto,
  reportServiceIssue,
  completeService,
  getProviderActiveJob
} from '../controllers/providerController.js';

const router = express.Router();

// All provider routes require authentication
router.use(authMiddleware);

// ==================== EXISTING ROUTES ====================

// Job discovery & acceptance
router.get('/available-jobs', getAvailableJobs);
router.post('/:bookingId/accept-job', acceptJob);
// In your providerRoutes.js
router.get('/job/:bookingId/active', getProviderActiveJob);

// Provider status & location
router.put('/:firebaseUserId/status', updateProviderStatus);
router.get('/:firebaseUserId/status', getProviderStatus);
router.post('/:firebaseUserId/location', updateProviderLocation);

// Performance & history
router.get('/:firebaseUserId/performance', getProviderPerformance);
router.get('/:firebaseUserId/recent-jobs', getRecentJobs);
router.delete('/cancel/:bookingId', providerCancelJob);

// ==================== NEW SERVICE IN PROGRESS ROUTES ====================

// Active job details
router.get('/:bookingId/active-job', getActiveJob);

// Job status updates (start/pause/add time)
router.patch('/job/:bookingId/status', updateJobStatus);

// Photo upload (you'll need multer middleware for this)
router.post('/job/:bookingId/photos', uploadServicePhoto);

// Report issue
router.post('/job/:bookingId/issues', reportServiceIssue);

// Complete service
router.post('/job/:bookingId/complete', completeService);

export default router;