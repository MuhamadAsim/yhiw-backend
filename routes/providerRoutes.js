// routes/providerRoutes.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getAvailableJobs,
  getAvailableJobsTest,
  acceptJob,
  updateProviderStatus,
  updateProviderLocation,
  getProviderStatus,
  getProviderPerformance,
  getRecentJobs
} from '../controllers/providerController.js';


const router = express.Router();


// All provider routes require authentication
router.use(authMiddleware);

// Job endpoints
router.get('/available-jobs', getAvailableJobs);
router.get('/available-jobs-test', getAvailableJobsTest);
router.post('/accept-job/:bookingId', acceptJob);

// Provider status & location
router.put('/:firebaseUserId/status', updateProviderStatus);
router.get('/:firebaseUserId/status', getProviderStatus);
router.post('/:firebaseUserId/location', updateProviderLocation);

// Performance & history
router.get('/:firebaseUserId/performance', getProviderPerformance);
router.get('/:firebaseUserId/recent-jobs', getRecentJobs);



export default router;