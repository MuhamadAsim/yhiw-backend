// routes/websocketRoutes.js
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get WebSocket connection stats (admin only)
router.get('/stats', authenticateToken, (req, res) => {
  // Check if user is admin (you can add admin check middleware)
  const wsManager = req.app.get('wsManager');
  
  res.json({
    success: true,
    data: wsManager.getStats()
  });
});

// Send message to specific user
router.post('/send/:userId', authenticateToken, (req, res) => {
  const { userId } = req.params;
  const { type, data } = req.body;
  const wsManager = req.app.get('wsManager');
  
  const sent = wsManager.sendToUser(userId, { type, data });
  
  res.json({
    success: sent,
    message: sent ? 'Message sent' : 'User not connected'
  });
});

export default router;