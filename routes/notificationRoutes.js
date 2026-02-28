// routes/notificationRoutes.js
import express from 'express';
import {
  getUnreadCount,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getNotificationDetails
} from '../controllers/notificationController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All notification routes require authentication
router.use(authenticateToken);

router.get('/unread-count', getUnreadCount);
router.get('/', getNotifications);
router.get('/:notificationId', getNotificationDetails);
router.put('/:notificationId/read', markAsRead);
router.put('/read-all', markAllAsRead);

export default router;