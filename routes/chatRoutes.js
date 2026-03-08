// routes/chatRoutes.js
import express from 'express';
import {
  getChatHistory,
  sendMessage,
  pollNewMessages,
  markMessagesAsRead,
  getUnreadCount,
} from '../controllers/chatController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// All chat routes require authentication
router.use(authMiddleware);

// Get chat history for a booking
router.get('/:bookingId/messages', getChatHistory);

// Poll for new messages
router.get('/:bookingId/poll', pollNewMessages);

// Send a new message
router.post('/:bookingId/send', sendMessage);

// Mark messages as read
router.put('/:bookingId/read', markMessagesAsRead);

// Get unread message count
router.get('/:bookingId/unread', getUnreadCount);

export default router;