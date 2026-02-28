// websocket/server.js
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { Server } from 'http';

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocketServer({ server });
    this.clients = new Map(); // userId -> { ws, userType, subscriptions }
    this.userSockets = new Map(); // userId -> Set of socketIds
    this.rooms = new Map(); // roomName -> Set of userIds
    
    this.initialize();
  }

  initialize() {
    this.wss.on('connection', async (ws, req) => {
      try {
        // Extract token from query string
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        const userId = url.searchParams.get('userId');
        const userType = url.searchParams.get('userType');

        if (!token || !userId) {
          ws.close(1008, 'Unauthorized');
          return;
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Store connection
        const socketId = this.generateSocketId();
        this.clients.set(socketId, {
          ws,
          userId,
          userType,
          subscriptions: new Set()
        });

        // Add to user sockets map
        if (!this.userSockets.has(userId)) {
          this.userSockets.set(userId, new Set());
        }
        this.userSockets.get(userId).add(socketId);

        console.log(`🔌 WebSocket connected: ${userType} ${userId}`);

        // Send connection confirmation
        ws.send(JSON.stringify({
          type: 'connection_established',
          data: { socketId, userId, userType }
        }));

        // Handle incoming messages
        ws.on('message', (message) => {
          this.handleMessage(socketId, message);
        });

        // Handle disconnection
        ws.on('close', () => {
          this.handleDisconnect(socketId, userId);
        });

      } catch (error) {
        console.error('WebSocket connection error:', error);
        ws.close(1008, 'Authentication failed');
      }
    });
  }

  handleMessage(socketId, message) {
    try {
      const data = JSON.parse(message.toString());
      const client = this.clients.get(socketId);
      
      if (!client) return;

      const { type, payload } = data;
      console.log(`📨 Message from ${client.userId}:`, type);

      switch (type) {
        case 'subscribe':
          this.handleSubscribe(socketId, payload);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(socketId, payload);
          break;
        case 'request_status':
          this.handleStatusRequest(client, payload);
          break;
        case 'provider_status':
          this.handleProviderStatus(client, payload);
          break;
        case 'location_update':
          this.handleLocationUpdate(client, payload);
          break;
        case 'accept_job':
          this.handleAcceptJob(client, payload);
          break;
        case 'decline_job':
          this.handleDeclineJob(client, payload);
          break;
        default:
          console.log('Unknown message type:', type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  handleSubscribe(socketId, { room }) {
    const client = this.clients.get(socketId);
    if (!client) return;

    client.subscriptions.add(room);
    
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room).add(client.userId);
    
    console.log(`✅ ${client.userId} subscribed to ${room}`);
  }

  handleUnsubscribe(socketId, { room }) {
    const client = this.clients.get(socketId);
    if (!client) return;

    client.subscriptions.delete(room);
    
    if (this.rooms.has(room)) {
      this.rooms.get(room).delete(client.userId);
    }
  }

  handleStatusRequest(client, { bookingId }) {
    // This would typically query the database and send status
    // For now, just acknowledge
    this.sendToUser(client.userId, {
      type: 'status_update',
      data: { bookingId, status: 'searching' }
    });
  }

  handleProviderStatus(client, { isOnline, location }) {
    console.log(`Provider ${client.userId} is now ${isOnline ? 'online' : 'offline'}`);
    
    // Broadcast to relevant rooms (e.g., nearby customers)
    this.broadcastToRoom('nearby_customers', {
      type: 'provider_status_change',
      data: {
        providerId: client.userId,
        isOnline,
        location
      }
    });
  }

  handleLocationUpdate(client, location) {
    console.log(`Location update from ${client.userId}`);
    
    // Broadcast to customers who are waiting for this provider
    this.broadcastToRoom(`provider_${client.userId}`, {
      type: 'provider_location',
      data: {
        providerId: client.userId,
        ...location
      }
    });
  }

  handleAcceptJob(client, { jobId }) {
    console.log(`Provider ${client.userId} accepted job ${jobId}`);
    
    // Notify customer
    this.broadcastToRoom(`job_${jobId}`, {
      type: 'job_accepted',
      data: {
        jobId,
        providerId: client.userId,
        acceptedAt: new Date().toISOString()
      }
    });
  }

  handleDeclineJob(client, { jobId }) {
    console.log(`Provider ${client.userId} declined job ${jobId}`);
    
    // Notify customer or job dispatcher
    this.broadcastToRoom(`job_${jobId}`, {
      type: 'job_declined',
      data: {
        jobId,
        providerId: client.userId
      }
    });
  }

  handleDisconnect(socketId, userId) {
    this.clients.delete(socketId);
    
    if (this.userSockets.has(userId)) {
      this.userSockets.get(userId).delete(socketId);
      if (this.userSockets.get(userId).size === 0) {
        this.userSockets.delete(userId);
        
        // Clean up room subscriptions
        this.rooms.forEach((users, room) => {
          if (users.has(userId)) {
            users.delete(userId);
          }
        });
      }
    }
    
    console.log(`🔌 WebSocket disconnected: ${userId}`);
  }

  // Public methods for external use

  sendToUser(userId, message) {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return false;

    const messageStr = JSON.stringify(message);
    let sent = false;

    sockets.forEach(socketId => {
      const client = this.clients.get(socketId);
      if (client && client.ws.readyState === 1) { // WebSocket.OPEN
        client.ws.send(messageStr);
        sent = true;
      }
    });

    return sent;
  }

  sendToRoom(room, message) {
    const users = this.rooms.get(room);
    if (!users) return 0;

    let count = 0;
    users.forEach(userId => {
      if (this.sendToUser(userId, message)) {
        count++;
      }
    });

    return count;
  }

  broadcastToRoom(room, message) {
    return this.sendToRoom(room, message);
  }

  // Send job request to nearby providers
  sendJobRequestToProviders(jobData, providerIds) {
    const message = {
      type: 'new_job_request',
      data: jobData
    };

    let sentCount = 0;
    providerIds.forEach(providerId => {
      if (this.sendToUser(providerId, message)) {
        sentCount++;
      }
    });

    return sentCount;
  }

  generateSocketId() {
    return `socket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getStats() {
    return {
      totalConnections: this.clients.size,
      totalUsers: this.userSockets.size,
      totalRooms: this.rooms.size,
      connectionsByType: {
        customers: Array.from(this.clients.values()).filter(c => c.userType === 'customer').length,
        providers: Array.from(this.clients.values()).filter(c => c.userType === 'provider').length
      }
    };
  }
}

export default WebSocketManager;