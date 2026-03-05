// routes/jobRoutes.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  createJobNotification,
  checkJobStatus,
  cancelJob,
  getJobDetails,
  rateCompletedJob,
  completeService
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

router.post('/:bookingId/rate', rateCompletedJob);

router.post('/:bookingId/complete', completeService);



export default router;