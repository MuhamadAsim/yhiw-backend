// websocket/server.js - Enhanced version with full tracking support
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { Server } from 'http';
import ProviderLiveStatus from '../models/providerLiveLocationModel.js';
import Job from '../models/jobModel.js';
import User from '../models/userModel.js';

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocketServer({ server });
    this.clients = new Map(); // socketId -> { ws, userId, userType, subscriptions }
    this.userSockets = new Map(); // userId -> Set of socketIds
    this.rooms = new Map(); // roomName -> Set of userIds
    this.userLocations = new Map(); // userId -> { lat, lng, address, heading, speed, timestamp }
    this.jobViewers = new Map(); // jobId -> Set of userIds
    this.providerCurrentJobs = new Map(); // providerId -> jobId (for quick lookup)
    this.customerCurrentJobs = new Map(); // customerId -> jobId (for quick lookup)
    
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
          subscriptions: new Set(),
          connectedAt: new Date().toISOString()
        });

        // Add to user sockets map
        if (!this.userSockets.has(userId)) {
          this.userSockets.set(userId, new Set());
        }
        this.userSockets.get(userId).add(socketId);

        console.log(`🔌 WebSocket connected: ${userType} ${userId}`);

        // If provider, update online status in DB
        if (userType === 'provider') {
          try {
            const provider = await User.findOne({ firebaseUserId: userId });
            if (provider) {
              await ProviderLiveStatus.findOneAndUpdate(
                { providerId: provider._id },
                { 
                  isOnline: true, 
                  lastSeen: new Date(),
                  isAvailable: true
                },
                { upsert: true }
              );
            }
          } catch (dbError) {
            console.error('Error updating provider online status:', dbError);
          }
        }

        // Send connection confirmation
        ws.send(JSON.stringify({
          type: 'connection_established',
          data: { 
            socketId, 
            userId, 
            userType, 
            timestamp: new Date().toISOString(),
            message: 'Connected to YHIW real-time service'
          }
        }));

        // Handle incoming messages
        ws.on('message', (message) => {
          this.handleMessage(socketId, message);
        });

        // Handle disconnection
        ws.on('close', () => {
          this.handleDisconnect(socketId, userId, userType);
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
        // Subscription management
        case 'subscribe':
          this.handleSubscribe(socketId, payload);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(socketId, payload);
          break;
        
        // Status and location
        case 'request_status':
          this.handleStatusRequest(client, payload);
          break;
        case 'provider_status':
          this.handleProviderStatus(client, payload);
          break;
        case 'location_update':
          this.handleLocationUpdate(client, payload);
          break;
        case 'request_provider_location':
          this.handleRequestProviderLocation(client, payload);
          break;
        
        // Job management
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
        
        // Job status updates
        case 'en_route':
          this.handleEnRoute(client, payload);
          break;
        case 'arrived':
          this.handleArrived(client, payload);
          break;
        case 'start_service':
          this.handleStartService(client, payload);
          break;
        case 'complete_service':
          this.handleCompleteService(client, payload);
          break;
        
        // Tracking
        case 'start_tracking':
          this.handleStartTracking(client, payload);
          break;
        case 'stop_tracking':
          this.handleStopTracking(client, payload);
          break;
        
        default:
          console.log('Unknown message type:', type);
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
    // This would query the database and send status
    this.sendToUser(client.userId, {
      type: 'status_update',
      data: { 
        bookingId, 
        status: 'searching', 
        timestamp: new Date().toISOString() 
      }
    });
  }

  handleProviderStatus(client, { isOnline, location }) {
    console.log(`Provider ${client.userId} is now ${isOnline ? 'online' : 'offline'}`);
    
    if (isOnline && location) {
      this.userLocations.set(client.userId, {
        ...location,
        lastSeen: new Date().toISOString()
      });
    } else {
      this.userLocations.delete(client.userId);
    }
    
    this.broadcastToRoom('nearby_customers', {
      type: 'provider_status_change',
      data: {
        providerId: client.userId,
        isOnline,
        location: isOnline ? location : null
      }
    });
  }

  handleLocationUpdate(client, locationData) {
    console.log(`📍 Location update from ${client.userId}`);
    
    const { latitude, longitude, heading, speed, isManual, address, jobId } = locationData;
    
    // Update in-memory location
    this.userLocations.set(client.userId, {
      latitude,
      longitude,
      heading: heading || 0,
      speed: speed || 0,
      isManual: isManual || false,
      address: address || '',
      lastSeen: new Date().toISOString()
    });
    
    // If this provider is on a job, broadcast to the customer
    const currentJobId = jobId || this.providerCurrentJobs.get(client.userId);
    
    if (currentJobId) {
      // Find which customer is tracking this provider
      const jobRoom = `job_${currentJobId}`;
      const jobViewers = this.jobViewers.get(currentJobId) || new Set();
      
      // Broadcast to all users in the job room (should be just the customer)
      this.broadcastToRoom(jobRoom, {
        type: 'provider_location',
        data: {
          jobId: currentJobId,
          providerId: client.userId,
          location: {
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            isManual: isManual || false,
            lastUpdate: new Date().toISOString()
          }
        }
      });
      
      // Also broadcast to provider-specific room for redundancy
      this.broadcastToRoom(`provider_${client.userId}`, {
        type: 'provider_location',
        data: {
          jobId: currentJobId,
          providerId: client.userId,
          location: {
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            isManual: isManual || false,
            lastUpdate: new Date().toISOString()
          }
        }
      });
    }
  }

  handleRequestProviderLocation(client, { jobId, bookingId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`📍 Location requested for job ${jobIdentifier} by ${client.userId}`);
    
    // If this is a customer asking, find the provider and send current location
    if (client.userType === 'customer') {
      const providerId = this.getProviderForJob(jobIdentifier);
      if (providerId) {
        const location = this.userLocations.get(providerId);
        if (location) {
          this.sendToUser(client.userId, {
            type: 'provider_location',
            data: {
              jobId: jobIdentifier,
              providerId,
              location,
              timestamp: new Date().toISOString()
            }
          });
        }
      }
    }
  }

  handleAcceptJob(client, { jobId, bookingId, responseTime, currentLat, currentLng }) {
    console.log(`✅ Provider ${client.userId} accepted job ${jobId || bookingId}`);
    
    const jobIdentifier = jobId || bookingId;
    
    // Store this job as the provider's current job
    this.providerCurrentJobs.set(client.userId, jobIdentifier);
    
    // Prepare acceptance data with provider info
    const acceptData = {
      jobId: jobIdentifier,
      bookingId: bookingId || jobId,
      providerId: client.userId,
      providerName: client.providerName || 'Provider',
      acceptedAt: new Date().toISOString(),
      responseTime: responseTime || 0,
      location: currentLat && currentLng ? {
        latitude: currentLat,
        longitude: currentLng,
        timestamp: new Date().toISOString()
      } : null
    };
    
    // Notify customer
    this.broadcastToRoom(`job_${jobIdentifier}`, {
      type: 'job_accepted',
      data: acceptData
    });
    
    // Also send provider_assigned for backward compatibility
    this.broadcastToRoom(`job_${jobIdentifier}`, {
      type: 'provider_assigned',
      data: acceptData
    });
    
    // Notify other providers that job is taken
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
    console.log(`❌ Provider ${client.userId} declined job ${jobId || bookingId}`);
    
    const jobIdentifier = jobId || bookingId;
    
    this.broadcastToRoom(`job_${jobIdentifier}`, {
      type: 'job_declined',
      data: {
        jobId: jobIdentifier,
        bookingId: bookingId || jobId,
        providerId: client.userId,
        reason: reason || 'provider_declined',
        timestamp: new Date().toISOString()
      }
    });
    
    if (this.jobViewers.has(jobIdentifier)) {
      this.jobViewers.get(jobIdentifier).delete(client.userId);
    }
  }

  handleJobViewing(client, { jobId, bookingId }) {
    const jobIdentifier = jobId || bookingId;
    if (!jobIdentifier) return;
    
    console.log(`👁️ Provider ${client.userId} is viewing job ${jobIdentifier}`);
    
    if (!this.jobViewers.has(jobIdentifier)) {
      this.jobViewers.set(jobIdentifier, new Set());
    }
    this.jobViewers.get(jobIdentifier).add(client.userId);
    
    const viewerCount = this.jobViewers.get(jobIdentifier).size;
    this.broadcastToRoom(`job_${jobIdentifier}_viewers`, {
      type: 'viewer_count',
      data: {
        jobId: jobIdentifier,
        count: viewerCount
      }
    });
    
    client.subscriptions.add(`job_${jobIdentifier}`);
    if (!this.rooms.has(`job_${jobIdentifier}`)) {
      this.rooms.set(`job_${jobIdentifier}`, new Set());
    }
    this.rooms.get(`job_${jobIdentifier}`).add(client.userId);
  }

  // New handler for en-route status
  handleEnRoute(client, { jobId, bookingId, eta }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`🚗 Provider ${client.userId} is en-route to job ${jobIdentifier}`);
    
    this.broadcastToRoom(`job_${jobIdentifier}`, {
      type: 'provider_status_update',
      data: {
        jobId: jobIdentifier,
        bookingId: bookingId || jobId,
        status: 'en-route',
        message: 'Provider is on the way',
        eta: eta || 'Calculating...',
        timestamp: new Date().toISOString()
      }
    });
  }

  // New handler for arrived status
  handleArrived(client, { jobId, bookingId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`📍 Provider ${client.userId} arrived at job ${jobIdentifier}`);
    
    this.broadcastToRoom(`job_${jobIdentifier}`, {
      type: 'provider_status_update',
      data: {
        jobId: jobIdentifier,
        bookingId: bookingId || jobId,
        status: 'arrived',
        message: 'Provider has arrived',
        timestamp: new Date().toISOString()
      }
    });
  }

  // New handler for start service
  handleStartService(client, { jobId, bookingId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`▶️ Provider ${client.userId} started service for job ${jobIdentifier}`);
    
    this.broadcastToRoom(`job_${jobIdentifier}`, {
      type: 'provider_status_update',
      data: {
        jobId: jobIdentifier,
        bookingId: bookingId || jobId,
        status: 'started',
        message: 'Service has started',
        timestamp: new Date().toISOString()
      }
    });
  }

  // New handler for complete service
  handleCompleteService(client, { jobId, bookingId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`✅ Provider ${client.userId} completed job ${jobIdentifier}`);
    
    // Remove from current jobs
    this.providerCurrentJobs.delete(client.userId);
    
    this.broadcastToRoom(`job_${jobIdentifier}`, {
      type: 'provider_status_update',
      data: {
        jobId: jobIdentifier,
        bookingId: bookingId || jobId,
        status: 'completed',
        message: 'Service completed',
        timestamp: new Date().toISOString()
      }
    });
  }

  // New handler for start tracking
  handleStartTracking(client, { jobId, bookingId, providerId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`👀 ${client.userType} ${client.userId} started tracking job ${jobIdentifier}`);
    
    // Subscribe to provider's location updates
    const providerToTrack = providerId || this.getProviderForJob(jobIdentifier);
    if (providerToTrack) {
      const room = `provider_${providerToTrack}`;
      this.handleSubscribe(this.getSocketIdForUser(client.userId), { room });
    }
    
    // Subscribe to job updates
    this.handleSubscribe(this.getSocketIdForUser(client.userId), { room: `job_${jobIdentifier}` });
  }

  // New handler for stop tracking
  handleStopTracking(client, { jobId, bookingId, providerId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`🚫 ${client.userType} ${client.userId} stopped tracking job ${jobIdentifier}`);
    
    const providerToTrack = providerId || this.getProviderForJob(jobIdentifier);
    if (providerToTrack) {
      const room = `provider_${providerToTrack}`;
      this.handleUnsubscribe(this.getSocketIdForUser(client.userId), { room });
    }
    
    this.handleUnsubscribe(this.getSocketIdForUser(client.userId), { room: `job_${jobIdentifier}` });
  }

  handleRequestPendingJobs(client) {
    this.sendToUser(client.userId, {
      type: 'pending_jobs',
      data: { jobs: [] }
    });
  }

  async handleDisconnect(socketId, userId, userType) {
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
            if (viewers.size > 0) {
              this.broadcastToRoom(`job_${jobId}_viewers`, {
                type: 'viewer_count',
                data: { jobId, count: viewers.size }
              });
            }
          }
        });
        
        // If provider, update offline status in DB after delay
        if (userType === 'provider') {
          // Wait a bit before marking offline (in case of temporary disconnect)
          setTimeout(async () => {
            if (!this.userSockets.has(userId)) {
              try {
                const provider = await User.findOne({ firebaseUserId: userId });
                if (provider) {
                  await ProviderLiveStatus.findOneAndUpdate(
                    { providerId: provider._id },
                    { 
                      isOnline: false,
                      lastSeen: new Date()
                    }
                  );
                }
              } catch (dbError) {
                console.error('Error updating provider offline status:', dbError);
              }
              
              // Remove from current jobs
              const currentJob = this.providerCurrentJobs.get(userId);
              if (currentJob) {
                this.broadcastToRoom(`job_${currentJob}`, {
                  type: 'provider_disconnected',
                  data: {
                    jobId: currentJob,
                    providerId: userId,
                    message: 'Provider disconnected',
                    timestamp: new Date().toISOString()
                  }
                });
              }
              this.providerCurrentJobs.delete(userId);
            }
          }, 30000); // 30 second delay
          
          // Remove location
          this.userLocations.delete(userId);
        }
        
        console.log(`🔌 WebSocket disconnected: ${userId} (all sockets)`);
      }
    }
  }

  // ==================== PUBLIC METHODS ====================

  sendToUser(userId, message) {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return false;

    const messageStr = JSON.stringify(message);
    let sent = false;

    sockets.forEach(socketId => {
      const client = this.clients.get(socketId);
      if (client && client.ws.readyState === 1) {
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

  sendJobRequestToProviders(jobData, providerIds) {
    const message = {
      type: 'new_job_request',
      data: {
        id: jobData.jobId || jobData.bookingId,
        jobId: jobData.jobId,
        bookingId: jobData.bookingId,
        jobNumber: jobData.jobNumber,
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
        distance: jobData.distance || 'Calculating...',
        estimatedEarnings: jobData.estimatedEarnings,
        price: jobData.price || jobData.estimatedEarnings,
        urgency: jobData.urgency || 'normal',
        timestamp: new Date().toISOString(),
        description: jobData.description || '',
        vehicleDetails: jobData.vehicleDetails || '',
        expiresAt: new Date(Date.now() + 60000).toISOString() // Expires in 60 seconds
      }
    };

    let sentCount = 0;
    providerIds.forEach(providerId => {
      if (this.sendToUser(providerId, message)) {
        sentCount++;
        this.subscribeToJob(providerId, jobData.jobId || jobData.bookingId);
      }
    });

    return sentCount;
  }

  sendJobRequestToNearbyProviders(jobData, radius = 10) {
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
    const R = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
  }

  deg2rad(deg) {
    return deg * (Math.PI/180);
  }

  subscribeToJob(providerId, jobId) {
    if (!this.rooms.has(`job_${jobId}`)) {
      this.rooms.set(`job_${jobId}`, new Set());
    }
    this.rooms.get(`job_${jobId}`).add(providerId);
    
    if (!this.rooms.has(`job_${jobId}_viewers`)) {
      this.rooms.set(`job_${jobId}_viewers`, new Set());
    }
    this.rooms.get(`job_${jobId}_viewers`).add(providerId);
  }

  notifyCustomerOfProvider(customerId, providerData) {
    this.sendToUser(customerId, {
      type: 'provider_assigned',
      data: providerData
    });
  }

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

  // Helper method to get provider for a job
  getProviderForJob(jobId) {
    for (const [providerId, currentJobId] of this.providerCurrentJobs.entries()) {
      if (currentJobId === jobId) {
        return providerId;
      }
    }
    return null;
  }

  // Helper method to get socket ID for a user
  getSocketIdForUser(userId) {
    const sockets = this.userSockets.get(userId);
    if (sockets && sockets.size > 0) {
      return sockets.values().next().value;
    }
    return null;
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
      totalActiveProviders: this.userLocations.size,
      totalActiveJobs: this.providerCurrentJobs.size,
      connectionsByType: {
        customers: Array.from(this.clients.values()).filter(c => c.userType === 'customer').length,
        providers: Array.from(this.clients.values()).filter(c => c.userType === 'provider').length
      },
      onlineProviders: this.userLocations.size,
      activeJobs: this.providerCurrentJobs.size
    };
  }
}

export default WebSocketManager;