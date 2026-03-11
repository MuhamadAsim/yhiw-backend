// routes/jobRoutes.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  createJobNotification,
  checkJobStatus,
  cancelJob,
  getJobDetails,
  rateCompletedJob,
  getJobRating,
  getJobTimer,
  updateJobTimer,
} from '../controllers/jobController.js';

const router = express.Router();

// ==================== JOB ROUTES ====================

// Customer creates a new job (goes to Notification model)
router.post('/create-notification', authMiddleware, createJobNotification);

// Customer checks if job was accepted (polls this)
router.get('/:bookingId/status', authMiddleware, checkJobStatus);

// Customer cancels a pending job
router.delete('/:bookingId/cancel', authMiddleware, cancelJob);

// Provider views full job details before accepting
router.get('/:bookingId/details', authMiddleware, getJobDetails);

// In your customerRoutes.js, add this line with your other routes
router.post('/:bookingId/rate', authMiddleware, rateCompletedJob);


router.get('/:bookingId/rating', authMiddleware, getJobRating);


// Get timer for a specific job
router.get('/:bookingId/timer', getJobTimer);

// Update timer (pause/resume/update)
router.patch('/:bookingId/timer', updateJobTimer);




export default router;