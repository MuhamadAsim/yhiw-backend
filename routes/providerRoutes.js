import express from 'express';
import {
  updateProviderStatus,
  updateProviderLocation,
  getProviderStatus,
  getNearbyProviders,
  getProviderProfile,
  getProviderPerformance,
  getProviderPerformanceWithJobs,
  getProviderRecentJobs,
  getProviderServices,
  updateProviderServices
} from '../controllers/providerController.js';

const router = express.Router();

// ==================== LOCATION & STATUS ROUTES ====================
// Update provider online status
router.put('/:providerId/status', updateProviderStatus);

// Update provider location
router.post('/:providerId/location', updateProviderLocation);

// Get provider current status
router.get('/:providerId/status', getProviderStatus);

// Get nearby available providers (for customers)
router.get('/nearby', getNearbyProviders);

// ==================== PROFILE & PERFORMANCE ROUTES ====================
// Get provider profile
router.get('/:providerId/profile', getProviderProfile);

// Get provider performance stats
router.get('/:providerId/performance', getProviderPerformance);
router.get('/:providerId/performance/detailed', getProviderPerformanceWithJobs);

// Get provider recent jobs
router.get('/:providerId/recent-jobs', getProviderRecentJobs);

// ==================== SERVICES ROUTES ====================
// Get provider services
router.get('/:providerId/services', getProviderServices);

// Update provider services
router.put('/:providerId/services', updateProviderServices);

export default router;