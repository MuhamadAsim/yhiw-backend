import express from 'express';
import {
  createScheduledBooking,
  getUserScheduledBookings,
  getScheduledBookingById,
  cancelScheduledBooking,
} from '../controllers/scheduleController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authMiddleware, createScheduledBooking);
router.get('/user/:userId', authMiddleware, getUserScheduledBookings);
router.get('/:bookingId', authMiddleware, getScheduledBookingById);
router.patch('/:bookingId/cancel', authMiddleware, cancelScheduledBooking);

export default router;