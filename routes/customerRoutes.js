import express from 'express';
import {
    getSavedLocations,
    getRecentLocations,
    saveLocation,
    updateLocation,
    deleteLocation,
    addRecentLocation,
} from '../controllers/customerController.js';
import { authenticateToken } from '../middleware/auth.js';


const router = express.Router();





router.use(authenticateToken);




// Saved locations routes
router.get('/:userId/saved-locations', getSavedLocations);
router.post('/:userId/saved-locations', saveLocation);
router.put('/:userId/saved-locations/:locationId', updateLocation);

// Recent locations routes
router.get('/:userId/recent-locations', getRecentLocations);
router.post('/:userId/recent-locations', addRecentLocation);





export default router;