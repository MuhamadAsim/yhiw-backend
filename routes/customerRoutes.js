import express from 'express';
import { createBooking, getBookingStatus } from '../controllers/customerController.js';

const router = express.Router();

/**
 * @route POST /api/bookings/request
 * @desc Create a new booking and start provider search
 * @access Private
 */
router.post('/finding_provider', createBooking);

/**
 * @route GET /api/bookings/:bookingId/status
 * @desc Get the current status of a booking
 * @access Private
 */
router.get('/:bookingId/status', getBookingStatus);

export default router;