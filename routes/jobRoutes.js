// routes/jobRoutes.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  createJobNotification,
  checkJobStatus,
  cancelJob
} from '../controllers/jobController.js';



const router = express.Router();


// Customer routes
router.post('/create-notification', authMiddleware, createJobNotification);
router.get('/status/:bookingId', authMiddleware, checkJobStatus);
router.delete('/cancel/:bookingId', authMiddleware, cancelJob);



export default router;