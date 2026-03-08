// controllers/chatController.js
import Chat from '../models/chatModel.js';
import Job from '../models/Job.js'; // Import your Job model

// Helper to get job details from your job service
const getJobDetails = async (bookingId) => {
  try {
    console.log(`🔍 Fetching job details for booking: ${bookingId}`);
    
    // Find the job in your database using the bookingId
    const job = await Job.findOne({ bookingId })
      .select('customerId providerId'); // Only select what we need
    
    if (job) {
      console.log(`✅ Found job: customerId=${job.customerId}, providerId=${job.providerId}`);
      return {
        customerId: job.customerId.toString(), // Convert ObjectId to string
        providerId: job.providerId.toString()   // Convert ObjectId to string
      };
    }
    
    console.log(`❌ No job found for bookingId: ${bookingId}`);
    return null;
  } catch (error) {
    console.error('Error fetching job details:', error);
    return null;
  }
};


// Get chat history for a booking
export const getChatHistory = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id; // MongoDB ID from auth middleware
    const userType = req.user?.type; // 'customer' or 'provider' from auth

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required',
      });
    }

    // Find chat for this booking
    let chat = await Chat.findOne({ bookingId });

    if (!chat) {
      // Return empty chat if none exists
      return res.status(200).json({
        success: true,
        messages: [],
        chatExists: false,
      });
    }

    // Verify user has access to this chat
    if (userType === 'customer' && chat.customerId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to this chat',
      });
    }

    if (userType === 'provider' && chat.providerId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to this chat',
      });
    }

    // Mark messages as delivered if they were sent by the other party
    if (userType === 'customer') {
      // Mark provider messages as delivered
      chat.messages.forEach(msg => {
        if (msg.senderType === 'provider' && msg.status === 'sent') {
          msg.status = 'delivered';
        }
      });
      await chat.save();
    } else if (userType === 'provider') {
      // Mark customer messages as delivered
      chat.messages.forEach(msg => {
        if (msg.senderType === 'customer' && msg.status === 'sent') {
          msg.status = 'delivered';
        }
      });
      await chat.save();
    }

    res.status(200).json({
      success: true,
      messages: chat.messages,
      chatExists: true,
    });

  } catch (error) {
    console.error('Error in getChatHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat history',
      error: error.message,
    });
  }
};

// Send a new message
export const sendMessage = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { text, senderType } = req.body; // Now expecting senderType from frontend
    const userId = req.user?.id; // MongoDB ID from auth middleware

    if (!bookingId || !text) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID and message text are required',
      });
    }

    if (!text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot be empty',
      });
    }

    if (!senderType || !['customer', 'provider'].includes(senderType)) {
      return res.status(400).json({
        success: false,
        message: 'Valid sender type (customer/provider) is required',
      });
    }

    // Find or create chat
    let chat = await Chat.findOne({ bookingId });

    if (!chat) {
      // Need to fetch customerId and providerId from job service
      const jobDetails = await getJobDetails(bookingId);
      
      if (!jobDetails) {
        return res.status(400).json({
          success: false,
          message: 'Could not find job details for this booking',
        });
      }

      const { customerId, providerId } = jobDetails;
      
      if (!customerId || !providerId) {
        return res.status(400).json({
          success: false,
          message: 'Customer ID and Provider ID are required to create a new chat',
        });
      }

      chat = new Chat({
        bookingId,
        customerId,
        providerId,
        messages: [],
      });
    }

    // Verify user has access to this chat
    if (senderType === 'customer' && chat.customerId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to send message in this chat',
      });
    }

    if (senderType === 'provider' && chat.providerId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to send message in this chat',
      });
    }

    // Create new message
    const newMessage = {
      senderId: userId,
      senderType: senderType, // Use senderType from request
      text: text.trim(),
      status: 'sent',
      timestamp: new Date(),
    };

    chat.messages.push(newMessage);
    chat.lastMessageAt = new Date();
    await chat.save();

    // Get the newly created message with its ID
    const savedMessage = chat.messages[chat.messages.length - 1];

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      messageId: savedMessage._id,
      timestamp: savedMessage.timestamp,
    });

  } catch (error) {
    console.error('Error in sendMessage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message,
    });
  }
};

// Poll for new messages
export const pollNewMessages = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { lastMessageId, lastTimestamp } = req.query;
    const userId = req.user?.id;
    const userType = req.user?.type;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required',
      });
    }

    const chat = await Chat.findOne({ bookingId });

    if (!chat) {
      return res.status(200).json({
        success: true,
        newMessages: [],
      });
    }

    // Verify user has access to this chat
    if (userType === 'customer' && chat.customerId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to this chat',
      });
    }

    if (userType === 'provider' && chat.providerId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to this chat',
      });
    }

    // Find messages newer than the last known message
    let newMessages = [];
    
    if (lastMessageId) {
      // Find by ID
      const lastMessageIndex = chat.messages.findIndex(
        msg => msg._id.toString() === lastMessageId
      );
      
      if (lastMessageIndex !== -1) {
        newMessages = chat.messages.slice(lastMessageIndex + 1);
      }
    } else if (lastTimestamp) {
      // Find by timestamp
      const lastDate = new Date(lastTimestamp);
      newMessages = chat.messages.filter(
        msg => new Date(msg.timestamp) > lastDate
      );
    }

    // Filter out messages sent by the current user (they already have them)
    newMessages = newMessages.filter(msg => msg.senderId !== userId);

    // Mark new messages as delivered if they're from the other party
    let updated = false;
    newMessages.forEach(msg => {
      if (msg.status === 'sent') {
        msg.status = 'delivered';
        updated = true;
      }
    });

    if (updated) {
      await chat.save();
    }

    res.status(200).json({
      success: true,
      newMessages,
      count: newMessages.length,
    });

  } catch (error) {
    console.error('Error in pollNewMessages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to poll messages',
      error: error.message,
    });
  }
};

// Mark messages as read
export const markMessagesAsRead = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { messageIds } = req.body;
    const userId = req.user?.id;
    const userType = req.user?.type;

    if (!bookingId || !messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID and message IDs array are required',
      });
    }

    const chat = await Chat.findOne({ bookingId });

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    // Verify user has access to this chat
    if (userType === 'customer' && chat.customerId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to this chat',
      });
    }

    if (userType === 'provider' && chat.providerId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to this chat',
      });
    }

    // Mark specified messages as read
    let updated = false;
    chat.messages.forEach(msg => {
      if (messageIds.includes(msg._id.toString()) && msg.senderId !== userId) {
        if (msg.status !== 'read') {
          msg.status = 'read';
          updated = true;
        }
      }
    });

    if (updated) {
      await chat.save();
    }

    res.status(200).json({
      success: true,
      message: 'Messages marked as read',
    });

  } catch (error) {
    console.error('Error in markMessagesAsRead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      error: error.message,
    });
  }
};

// Get unread message count
export const getUnreadCount = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id;
    const userType = req.user?.type;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required',
      });
    }

    const chat = await Chat.findOne({ bookingId });

    if (!chat) {
      return res.status(200).json({
        success: true,
        unreadCount: 0,
      });
    }

    // Verify user has access to this chat
    if (userType === 'customer' && chat.customerId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to this chat',
      });
    }

    if (userType === 'provider' && chat.providerId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to this chat',
      });
    }

    // Count unread messages from the other party
    const unreadCount = chat.messages.filter(
      msg => msg.senderId !== userId && msg.status !== 'read'
    ).length;

    res.status(200).json({
      success: true,
      unreadCount,
    });

  } catch (error) {
    console.error('Error in getUnreadCount:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message,
    });
  }
};