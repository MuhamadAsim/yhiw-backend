// websocket/server.js - Fixed version
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { Server } from 'http';

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocketServer({ server });
    this.clients = new Map(); // socketId -> { ws, userId, userType, subscriptions }
    this.userSockets = new Map(); // userId -> Set of socketIds
    this.rooms = new Map(); // roomName -> Set of userIds
    this.userLocations = new Map(); // userId -> { lat, lng, address, timestamp }
    this.jobViewers = new Map(); // jobId -> Set of userIds
    
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
          data: { socketId, userId, userType, timestamp: new Date().toISOString() }
        }));

        // Handle incoming messages
        ws.on('message', (message) => {
          this.handleMessage(socketId, message);
        });

        // Handle disconnection
        ws.on('close', () => {
          this.handleDisconnect(socketId, userId);
        });

        // Handle errors
        ws.on('error', (error) => {
          console.error(`WebSocket error for ${userId}:`, error);
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
      console.log(`📨 Message from ${client.userId} (${client.userType}):`, type);

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
        case 'job_viewing':
          this.handleJobViewing(client, payload);
          break;
        case 'request_pending_jobs':
          this.handleRequestPendingJobs(client);
          break;
        default:
          console.log('Unknown message type:', type);
          // Send error back to client
          this.sendToUser(client.userId, {
            type: 'error',
            data: { message: `Unknown message type: ${type}` }
          });
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
    
    // Confirm subscription
    this.sendToUser(client.userId, {
      type: 'subscribed',
      data: { room }
    });
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
      data: { bookingId, status: 'searching', timestamp: new Date().toISOString() }
    });
  }

  handleProviderStatus(client, { isOnline, location }) {
    console.log(`Provider ${client.userId} is now ${isOnline ? 'online' : 'offline'}`);
    
    if (isOnline && location) {
      // Store provider location
      this.userLocations.set(client.userId, {
        ...location,
        lastSeen: new Date().toISOString()
      });
    } else {
      // Remove location when offline
      this.userLocations.delete(client.userId);
    }
    
    // Broadcast to relevant rooms (e.g., nearby customers)
    this.broadcastToRoom('nearby_customers', {
      type: 'provider_status_change',
      data: {
        providerId: client.userId,
        isOnline,
        location: isOnline ? location : null
      }
    });
  }

  handleLocationUpdate(client, location) {
    console.log(`Location update from ${client.userId}`);
    
    // Update stored location
    this.userLocations.set(client.userId, {
      ...location,
      lastSeen: new Date().toISOString()
    });
    
    // Broadcast to customers who are waiting for this provider
    this.broadcastToRoom(`provider_${client.userId}`, {
      type: 'provider_location',
      data: {
        providerId: client.userId,
        ...location
      }
    });
  }

  handleAcceptJob(client, { jobId, bookingId, responseTime }) {
    console.log(`Provider ${client.userId} accepted job ${jobId || bookingId}`);
    
    const jobIdentifier = jobId || bookingId;
    
    // Notify customer (via job room)
    this.broadcastToRoom(`job_${jobIdentifier}`, {
      type: 'job_accepted',
      data: {
        jobId: jobIdentifier,
        bookingId: bookingId || jobId,
        providerId: client.userId,
        providerName: client.providerName, // You'd need to fetch this
        acceptedAt: new Date().toISOString(),
        responseTime
      }
    });
    
    // Also notify all providers who were viewing this job that it's taken
    this.broadcastToRoom(`job_${jobIdentifier}_viewers`, {
      type: 'job_taken',
      data: {
        jobId: jobIdentifier,
        providerId: client.userId
      }
    });
    
    // Clean up job viewers
    this.jobViewers.delete(jobIdentifier);
  }

  handleDeclineJob(client, { jobId, bookingId, reason }) {
    console.log(`Provider ${client.userId} declined job ${jobId || bookingId}`);
    
    const jobIdentifier = jobId || bookingId;
    
    // Notify job dispatcher
    this.broadcastToRoom(`job_${jobIdentifier}`, {
      type: 'job_declined',
      data: {
        jobId: jobIdentifier,
        bookingId: bookingId || jobId,
        providerId: client.userId,
        reason: reason || 'provider_declined'
      }
    });
    
    // Remove from job viewers
    if (this.jobViewers.has(jobIdentifier)) {
      this.jobViewers.get(jobIdentifier).delete(client.userId);
    }
  }

  handleJobViewing(client, { jobId, bookingId }) {
    const jobIdentifier = jobId || bookingId;
    if (!jobIdentifier) return;
    
    console.log(`Provider ${client.userId} is viewing job ${jobIdentifier}`);
    
    // Add to job viewers
    if (!this.jobViewers.has(jobIdentifier)) {
      this.jobViewers.set(jobIdentifier, new Set());
    }
    this.jobViewers.get(jobIdentifier).add(client.userId);
    
    // Broadcast viewer count to all viewers of this job
    const viewerCount = this.jobViewers.get(jobIdentifier).size;
    this.broadcastToRoom(`job_${jobIdentifier}_viewers`, {
      type: 'viewer_count',
      data: {
        jobId: jobIdentifier,
        count: viewerCount
      }
    });
    
    // Subscribe to job updates automatically
    client.subscriptions.add(`job_${jobIdentifier}`);
    if (!this.rooms.has(`job_${jobIdentifier}`)) {
      this.rooms.set(`job_${jobIdentifier}`, new Set());
    }
    this.rooms.get(`job_${jobIdentifier}`).add(client.userId);
  }

  handleRequestPendingJobs(client) {
    // This would query database for pending jobs for this provider
    // For now, just acknowledge
    this.sendToUser(client.userId, {
      type: 'pending_jobs',
      data: { jobs: [] } // Would be populated from DB
    });
  }

  handleDisconnect(socketId, userId) {
    this.clients.delete(socketId);
    
    if (this.userSockets.has(userId)) {
      this.userSockets.get(userId).delete(socketId);
      if (this.userSockets.get(userId).size === 0) {
        this.userSockets.delete(userId);
        
        // Remove from rooms
        this.rooms.forEach((users, room) => {
          if (users.has(userId)) {
            users.delete(userId);
          }
        });
        
        // Remove from job viewers
        this.jobViewers.forEach((viewers, jobId) => {
          if (viewers.has(userId)) {
            viewers.delete(userId);
            // Update viewer count
            if (viewers.size > 0) {
              this.broadcastToRoom(`job_${jobId}_viewers`, {
                type: 'viewer_count',
                data: { jobId, count: viewers.size }
              });
            }
          }
        });
        
        // Remove location
        this.userLocations.delete(userId);
        
        console.log(`🔌 WebSocket disconnected: ${userId} (all sockets)`);
      }
    }
  }

  // Public methods for external use

  sendToUser(userId, message) {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return false;

    const messageStr = JSON.stringify(message);
    let sent = false;

    sockets.forEach(socketId => {
      const client = this.clients.get(socketId);
      if (client && client.ws.readyState === 1) { // WebSocket.OPEN
        try {
          client.ws.send(messageStr);
          sent = true;
        } catch (error) {
          console.error(`Error sending to ${userId}:`, error);
        }
      }
    });

    return sent;
  }

  sendToRoom(room, message) {
    const users = this.rooms.get(room);
    if (!users || users.size === 0) return 0;

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

  // Send job request to specific providers
  sendJobRequestToProviders(jobData, providerIds) {
    const message = {
      type: 'new_job_request',
      data: {
        id: jobData.jobId || jobData.bookingId,
        bookingId: jobData.bookingId,
        customerName: jobData.customerName,
        customerId: jobData.customerId,
        serviceType: jobData.serviceType,
        serviceName: jobData.serviceName,
        pickupLocation: jobData.pickupLocation,
        pickupLat: jobData.pickupLat,
        pickupLng: jobData.pickupLng,
        dropoffLocation: jobData.dropoffLocation,
        dropoffLat: jobData.dropoffLat,
        dropoffLng: jobData.dropoffLng,
        distance: jobData.distance,
        estimatedEarnings: jobData.estimatedEarnings,
        price: jobData.price || jobData.estimatedEarnings,
        urgency: jobData.urgency,
        timestamp: new Date().toISOString(),
        description: jobData.description,
        vehicleDetails: jobData.vehicleDetails
      }
    };

    let sentCount = 0;
    providerIds.forEach(providerId => {
      if (this.sendToUser(providerId, message)) {
        sentCount++;
        // Subscribe provider to job updates
        this.subscribeToJob(providerId, jobData.jobId || jobData.bookingId);
      }
    });

    return sentCount;
  }

  // Send job request to nearby providers based on location
  sendJobRequestToNearbyProviders(jobData, radius = 10) { // radius in km
    const nearbyProviders = this.findNearbyProviders(
      jobData.pickupLat, 
      jobData.pickupLng, 
      radius
    );
    
    return this.sendJobRequestToProviders(jobData, nearbyProviders);
  }

  findNearbyProviders(lat, lng, radiusKm) {
    const nearby = [];
    
    this.userLocations.forEach((location, providerId) => {
      // Calculate distance (simplified - you'd want proper haversine formula)
      const distance = this.calculateDistance(
        lat, lng,
        location.latitude, location.longitude
      );
      
      if (distance <= radiusKm) {
        nearby.push(providerId);
      }
    });
    
    return nearby;
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    // Haversine formula to calculate distance in km
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distance = R * c; // Distance in km
    return distance;
  }

  deg2rad(deg) {
    return deg * (Math.PI/180);
  }

  subscribeToJob(providerId, jobId) {
    if (!this.rooms.has(`job_${jobId}`)) {
      this.rooms.set(`job_${jobId}`, new Set());
    }
    this.rooms.get(`job_${jobId}`).add(providerId);
    
    // Also add to viewers room
    if (!this.rooms.has(`job_${jobId}_viewers`)) {
      this.rooms.set(`job_${jobId}_viewers`, new Set());
    }
    this.rooms.get(`job_${jobId}_viewers`).add(providerId);
  }

  // Notify customer about provider status
  notifyCustomerOfProvider(customerId, providerData) {
    this.sendToUser(customerId, {
      type: 'provider_assigned',
      data: providerData
    });
  }

  // Update job status
  updateJobStatus(jobId, status, additionalData = {}) {
    this.broadcastToRoom(`job_${jobId}`, {
      type: 'job_status_update',
      data: {
        jobId,
        status,
        ...additionalData,
        timestamp: new Date().toISOString()
      }
    });
  }

  generateSocketId() {
    return `socket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getStats() {
    return {
      totalConnections: this.clients.size,
      totalUsers: this.userSockets.size,
      totalRooms: this.rooms.size,
      totalJobsBeingViewed: this.jobViewers.size,
      connectionsByType: {
        customers: Array.from(this.clients.values()).filter(c => c.userType === 'customer').length,
        providers: Array.from(this.clients.values()).filter(c => c.userType === 'provider').length
      },
      onlineProviders: this.userLocations.size
    };
  }
}

export default WebSocketManager;