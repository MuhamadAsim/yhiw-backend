// models/chatModel.js
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  senderId: {
    type: String,
    required: true,
  },
  senderType: {
    type: String,
    enum: ['customer', 'provider'],
    required: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['sending', 'sent', 'delivered', 'read'],
    default: 'sent',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const chatSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  customerId: {
    type: String,
    required: true,
    index: true,
  },
  providerId: {
    type: String,
    required: true,
    index: true,
  },
  messages: [messageSchema],
  lastMessageAt: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// FIXED: Remove the next parameter and just return
chatSchema.pre('save', function() {
  if (this.messages.length > 0) {
    this.lastMessageAt = this.messages[this.messages.length - 1].timestamp;
  }
});

const Chat = mongoose.model('Chat', chatSchema);

export default Chat;