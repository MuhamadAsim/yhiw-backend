import express from 'express';
import {
    createBooking,
    getBookingStatus,
    getSavedLocations,
    getRecentLocations,
    saveLocation,
    updateLocation,
    deleteLocation,
    toggleFavoriteLocation,
    addRecentLocation,
    clearRecentLocations
} from '../controllers/customerController.js';
import { authenticateToken } from '../middleware/auth.js';


const router = express.Router();





router.use(authenticateToken);

/**
 * @route POST /api/bookings/request
 * @desc Create a new booking and start provider search
 * @access Private
 */

/**
 * @route GET /api/bookings/:bookingId/status
 * @desc Get the current status of a booking
 * @access Private
 */
router.get('/:bookingId/status', getBookingStatus);



// Saved locations routes
router.get('/:userId/saved-locations', getSavedLocations);
router.post('/:userId/saved-locations', saveLocation);
router.put('/:userId/saved-locations/:locationId', updateLocation);
router.delete('/:userId/saved-locations/:locationId', deleteLocation);
router.patch('/:userId/saved-locations/:locationId/favorite', toggleFavoriteLocation);

// Recent locations routes
router.get('/:userId/recent-locations', getRecentLocations);
router.post('/:userId/recent-locations', addRecentLocation);
router.delete('/:userId/recent-locations', clearRecentLocations);





export default router;