// routes/testRoutes.js
import express from 'express';
import Job from '../models/jobModel.js';
import User from '../models/userModel.js';

const router = express.Router();

// Test WebSocket communication
router.post('/test/websocket', async (req, res) => {
  try {
    const { bookingId, customerId, message } = req.body;
    const wsManager = req.app.get('wsManager');
    
    if (!wsManager) {
      return res.status(500).json({ 
        success: false, 
        message: 'WebSocket manager not available' 
      });
    }
    
    const result = wsManager.sendToUser(customerId, {
      type: 'test_message',
      data: {
        bookingId,
        message: message || 'Test message',
        timestamp: new Date().toISOString()
      }
    });
    
    res.json({
      success: result,
      message: result ? 'Message sent successfully' : 'Failed to send message (user might be offline)'
    });
  } catch (error) {
    console.error('Test WebSocket error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get WebSocket stats
router.get('/websocket/stats', (req, res) => {
  try {
    const wsManager = req.app.get('wsManager');
    
    if (!wsManager) {
      return res.status(500).json({ 
        success: false, 
        message: 'WebSocket manager not available' 
      });
    }
    
    const stats = wsManager.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting WebSocket stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Simulate provider acceptance for testing
router.post('/test/simulate-acceptance', async (req, res) => {
  try {
    const { bookingId, providerId } = req.body;
    const wsManager = req.app.get('wsManager');
    
    if (!wsManager) {
      return res.status(500).json({ 
        success: false, 
        message: 'WebSocket manager not available' 
      });
    }
    
    // Find the job
    const job = await Job.findOne({ bookingId });
    if (!job) {
      return res.status(404).json({ 
        success: false, 
        message: 'Job not found' 
      });
    }
    
    // Find provider
    const provider = await User.findOne({ firebaseUserId: providerId });
    if (!provider) {
      return res.status(404).json({ 
        success: false, 
        message: 'Provider not found' 
      });
    }
    
    // Get customer
    const customer = await User.findById(job.customerId);
    
    // Create provider data
    const providerData = {
      bookingId: job.bookingId,
      jobId: job._id.toString(),
      providerId: provider.firebaseUserId,
      providerName: provider.fullName || 'Test Provider',
      providerRating: provider.rating || 4.5,
      providerImage: provider.profileImage || '',
      estimatedArrival: '10-15 minutes',
      vehicleDetails: provider.vehicleDetails || 'Test Vehicle',
      providerPhone: provider.phone || '',
      licensePlate: provider.licensePlate || '',
      provider: {
        id: provider.firebaseUserId,
        name: provider.fullName || 'Test Provider',
        rating: provider.rating || 4.5,
        profileImage: provider.profileImage || '',
        vehicleDetails: provider.vehicleDetails || '',
        phone: provider.phone || '',
        licensePlate: provider.licensePlate || ''
      }
    };
    
    // Send to customer
    if (customer?.firebaseUserId) {
      wsManager.sendToUser(customer.firebaseUserId, {
        type: 'job_accepted',
        data: providerData
      });
      
      wsManager.sendToUser(customer.firebaseUserId, {
        type: 'provider_assigned',
        data: providerData
      });
    }
    
    res.json({
      success: true,
      message: 'Acceptance simulated',
      data: providerData
    });
  } catch (error) {
    console.error('Error simulating acceptance:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;