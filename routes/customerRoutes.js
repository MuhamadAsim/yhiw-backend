// routes/customerRoutes.js
import express from 'express';
import {
    // Existing imports
    getSavedLocations,
    getRecentLocations,
    saveLocation,
    updateLocation,
    deleteLocation,
    addRecentLocation,
    
    // NEW: Import customer job controllers
    getCustomerJobDetails,
    getProviderLocationForCustomer,
    getJobStatusForCustomer,
    customerCancelJob,

    getRouteToPickup,
    getLiveTracking,
    getCustomerJobDetailServiceInprogress
} from '../controllers/customerController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// ==================== EXISTING LOCATION ROUTES ====================
// Saved locations routes
router.get('/:userId/saved-locations', getSavedLocations);
router.post('/:userId/saved-locations', saveLocation);
router.put('/:userId/saved-locations/:locationId', updateLocation);
// Add this if you have delete functionality
router.delete('/:userId/saved-locations/:locationId', deleteLocation);

// Recent locations routes
router.get('/:userId/recent-locations', getRecentLocations);
router.post('/:userId/recent-locations', addRecentLocation);

// ==================== NEW JOB ROUTES FOR PROVIDER ASSIGNED SCREEN ====================
// These use bookingId instead of userId since they're job-specific

// Get complete job details for customer view (after provider accepted)
router.get('/:bookingId/details', getCustomerJobDetails);
router.get('/:bookingId/details_inprogress', getCustomerJobDetailServiceInprogress);

// Get provider's real-time location (for live tracking)
router.get('/:bookingId/provider-location', getProviderLocationForCustomer);

// Get job status for polling
router.get('/:bookingId/status', getJobStatusForCustomer);

// Cancel job from customer side (after provider accepted)
router.post('/job/cancel/:bookingId', customerCancelJob);

router.get('/:bookingId/route', authMiddleware, getRouteToPickup);
router.get('/:bookingId/live-tracking', authMiddleware, getLiveTracking);


export default router;