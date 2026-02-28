// controllers/notificationController.js
import Notification from '../models/notificationModel.js';

// Get unread notification count (for the badge on bell icon)
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const count = await Notification.countDocuments({
      userId,
      isRead: false
    });

    return res.status(200).json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message
    });
  }
};

// Get all notifications for a user (for the notification screen)
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const total = await Notification.countDocuments({ userId });
    
    // Mark as "seen" but not necessarily "read"
    // The "read" status will be updated when they actually open/click
    
    return res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get notifications',
      error: error.message
    });
  }
};

// Mark a notification as read (when user clicks/opens it)
export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;
    
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { 
        isRead: true,
        isClicked: true 
      },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message
    });
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    
    await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true }
    );
    
    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Error marking all as read:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark all as read',
      error: error.message
    });
  }
};

// Get notification details (when provider clicks on a notification)
export const getNotificationDetails = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;
    
    const notification = await Notification.findOne({
      _id: notificationId,
      userId
    }).lean();
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    // Mark as clicked
    await Notification.findByIdAndUpdate(notificationId, {
      isClicked: true
    });
    
    // If it's a job request notification, we might want to fetch additional job details
    if (notification.type === 'NEW_JOB_REQUEST' && notification.data?.jobId) {
      // You can populate with job details here if needed
      // This is where you'd fetch the full job details for the provider
    }
    
    return res.status(200).json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Error getting notification details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get notification details',
      error: error.message
    });
  }
};