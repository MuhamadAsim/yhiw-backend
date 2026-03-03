// websocket/server.js - Enhanced version with dedicated rooms for provider-customer communication
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
    this.customerTracking = new Map(); // providerId -> Set of customerIds tracking them
    this.jobRooms = new Map(); // jobId -> { providerId, customerId, roomName: `job_${jobId}` }
    
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
        case 'request_customer_location':
          this.handleRequestCustomerLocation(client, payload);
          break;
        
        // Job management
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
        
        // NEW: Dedicated room for assigned jobs
        case 'join_job_room':
          this.handleJoinJobRoom(client, payload);
          break;
        case 'leave_job_room':
          this.handleLeaveJobRoom(client, payload);
          break;
        case 'send_to_job_room':
          this.handleSendToJobRoom(client, payload);
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
    
    // If this provider is on a job, broadcast to the customer via job room
    const currentJobId = jobId || this.providerCurrentJobs.get(client.userId);
    
    if (currentJobId) {
      // Get the job room name
      const jobRoom = `job_${currentJobId}`;
      
      // Calculate distance to pickup if we have pickup location
      // This would come from database - for now just broadcast location
      
      // Broadcast to all users in the job room (customer and provider)
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
      
      // Also broadcast ETA update if we can calculate
      this.broadcastToRoom(jobRoom, {
        type: 'eta_update',
        data: {
          jobId: currentJobId,
          eta: this.calculateETA(latitude, longitude, locationData.pickupLat, locationData.pickupLng),
          distance: this.calculateDistance(latitude, longitude, locationData.pickupLat, locationData.pickupLng)
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

  handleRequestCustomerLocation(client, { jobId, bookingId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`📍 Customer location requested for job ${jobIdentifier} by ${client.userId}`);
    
    // If this is a provider asking, find the customer and send current location
    if (client.userType === 'provider') {
      const jobRoom = `job_${jobIdentifier}`;
      const jobInfo = this.jobRooms.get(jobIdentifier);
      
      if (jobInfo && jobInfo.customerId) {
        const customerId = jobInfo.customerId;
        // Customer location would come from database or WebSocket
        // For now, we'll just acknowledge
        this.sendToUser(client.userId, {
          type: 'customer_location_info',
          data: {
            jobId: jobIdentifier,
            message: 'Customer location is at pickup point'
          }
        });
      }
    }
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

  // Handler for en-route status
  handleEnRoute(client, { jobId, bookingId, eta }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`🚗 Provider ${client.userId} is en-route to job ${jobIdentifier}`);
    
    // Get job room
    const jobRoom = `job_${jobIdentifier}`;
    
    this.broadcastToRoom(jobRoom, {
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

  // Handler for arrived status
  handleArrived(client, { jobId, bookingId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`📍 Provider ${client.userId} arrived at job ${jobIdentifier}`);
    
    const jobRoom = `job_${jobIdentifier}`;
    
    this.broadcastToRoom(jobRoom, {
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

  // Handler for start service
  handleStartService(client, { jobId, bookingId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`▶️ Provider ${client.userId} started service for job ${jobIdentifier}`);
    
    const jobRoom = `job_${jobIdentifier}`;
    
    this.broadcastToRoom(jobRoom, {
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

  // Handler for complete service
  handleCompleteService(client, { jobId, bookingId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`✅ Provider ${client.userId} completed job ${jobIdentifier}`);
    
    // Remove from current jobs
    this.providerCurrentJobs.delete(client.userId);
    
    const jobRoom = `job_${jobIdentifier}`;
    
    this.broadcastToRoom(jobRoom, {
      type: 'provider_status_update',
      data: {
        jobId: jobIdentifier,
        bookingId: bookingId || jobId,
        status: 'completed',
        message: 'Service completed',
        timestamp: new Date().toISOString()
      }
    });
    
    // Clean up job room after completion
    setTimeout(() => {
      this.cleanupJobRoom(jobIdentifier);
    }, 5000);
  }

  // NEW: Handle joining a dedicated job room
  handleJoinJobRoom(client, { jobId, bookingId, role }) {
    const jobIdentifier = jobId || bookingId;
    if (!jobIdentifier) return;
    
    console.log(`🚪 ${client.userType} ${client.userId} joining job room ${jobIdentifier} as ${role}`);
    
    const roomName = `job_${jobIdentifier}`;
    
    // Store job room info
    if (!this.jobRooms.has(jobIdentifier)) {
      this.jobRooms.set(jobIdentifier, {
        providerId: role === 'provider' ? client.userId : null,
        customerId: role === 'customer' ? client.userId : null,
        roomName,
        createdAt: new Date().toISOString()
      });
    } else {
      const jobInfo = this.jobRooms.get(jobIdentifier);
      if (role === 'provider') {
        jobInfo.providerId = client.userId;
      } else if (role === 'customer') {
        jobInfo.customerId = client.userId;
      }
      this.jobRooms.set(jobIdentifier, jobInfo);
    }
    
    // Subscribe to the room
    const socketId = this.getSocketIdForUser(client.userId);
    this.handleSubscribe(socketId, { room: roomName });
    
    // If this is a provider, store their current job
    if (role === 'provider') {
      this.providerCurrentJobs.set(client.userId, jobIdentifier);
    }
    
    // If this is a customer, store their current job
    if (role === 'customer') {
      this.customerCurrentJobs.set(client.userId, jobIdentifier);
    }
    
    // Send confirmation
    this.sendToUser(client.userId, {
      type: 'joined_job_room',
      data: {
        jobId: jobIdentifier,
        room: roomName,
        role,
        message: `You have joined the job room for ${jobIdentifier}`
      }
    });
    
    // Notify other party in the room
    this.broadcastToRoom(roomName, {
      type: 'user_joined',
      data: {
        userId: client.userId,
        userType: client.userType,
        role,
        timestamp: new Date().toISOString()
      }
    });
  }

  // NEW: Handle leaving a job room
  handleLeaveJobRoom(client, { jobId, bookingId }) {
    const jobIdentifier = jobId || bookingId;
    if (!jobIdentifier) return;
    
    console.log(`🚪 ${client.userType} ${client.userId} leaving job room ${jobIdentifier}`);
    
    const roomName = `job_${jobIdentifier}`;
    
    // Unsubscribe from the room
    const socketId = this.getSocketIdForUser(client.userId);
    this.handleUnsubscribe(socketId, { room: roomName });
    
    // Update job room info
    if (this.jobRooms.has(jobIdentifier)) {
      const jobInfo = this.jobRooms.get(jobIdentifier);
      if (client.userType === 'provider') {
        jobInfo.providerId = null;
        this.providerCurrentJobs.delete(client.userId);
      } else if (client.userType === 'customer') {
        jobInfo.customerId = null;
        this.customerCurrentJobs.delete(client.userId);
      }
      this.jobRooms.set(jobIdentifier, jobInfo);
    }
    
    // Notify other party in the room
    this.broadcastToRoom(roomName, {
      type: 'user_left',
      data: {
        userId: client.userId,
        userType: client.userType,
        timestamp: new Date().toISOString()
      }
    });
  }

  // NEW: Send message to job room
  handleSendToJobRoom(client, { jobId, bookingId, messageType, data }) {
    const jobIdentifier = jobId || bookingId;
    if (!jobIdentifier) return;
    
    const roomName = `job_${jobIdentifier}`;
    
    this.broadcastToRoom(roomName, {
      type: messageType,
      data: {
        ...data,
        senderId: client.userId,
        senderType: client.userType,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Handler for start tracking
  handleStartTracking(client, { jobId, bookingId, providerId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`👀 ${client.userType} ${client.userId} started tracking job ${jobIdentifier}`);
    
    // Instead of separate rooms, use the job room
    const roomName = `job_${jobIdentifier}`;
    const socketId = this.getSocketIdForUser(client.userId);
    
    // Subscribe to job room
    this.handleSubscribe(socketId, { room: roomName });
    
    // Track who's tracking this provider
    if (providerId) {
      if (!this.customerTracking.has(providerId)) {
        this.customerTracking.set(providerId, new Set());
      }
      this.customerTracking.get(providerId).add(client.userId);
    }
    
    // Send current provider location if available
    const providerToTrack = providerId || this.getProviderForJob(jobIdentifier);
    if (providerToTrack) {
      const location = this.userLocations.get(providerToTrack);
      if (location) {
        this.sendToUser(client.userId, {
          type: 'provider_location',
          data: {
            jobId: jobIdentifier,
            providerId: providerToTrack,
            location,
            timestamp: new Date().toISOString()
          }
        });
      }
    }
  }

  // Handler for stop tracking
  handleStopTracking(client, { jobId, bookingId, providerId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`🚫 ${client.userType} ${client.userId} stopped tracking job ${jobIdentifier}`);
    
    // Unsubscribe from job room
    const roomName = `job_${jobIdentifier}`;
    const socketId = this.getSocketIdForUser(client.userId);
    this.handleUnsubscribe(socketId, { room: roomName });
    
    // Remove from tracking map
    if (providerId && this.customerTracking.has(providerId)) {
      this.customerTracking.get(providerId).delete(client.userId);
    }
  }

  handleRequestPendingJobs(client) {
    this.sendToUser(client.userId, {
      type: 'pending_jobs',
      data: { jobs: [] }
    });
  }

  // NEW: Clean up job room
  cleanupJobRoom(jobId) {
    if (this.jobRooms.has(jobId)) {
      const jobInfo = this.jobRooms.get(jobId);
      const roomName = jobInfo.roomName;
      
      // Remove all users from room
      if (this.rooms.has(roomName)) {
        this.rooms.delete(roomName);
      }
      
      // Clear job info
      this.jobRooms.delete(jobId);
      
      console.log(`🧹 Cleaned up job room for ${jobId}`);
    }
  }

  // Helper to calculate distance
  calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 'Calculating...';
    
    const R = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance < 1 
      ? `${Math.round(distance * 1000)} m` 
      : `${distance.toFixed(1)} km`;
  }

  // Helper to calculate ETA
  calculateETA(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 'Calculating...';
    
    const distance = this.calculateDistanceRaw(lat1, lon1, lat2, lon2);
    const avgSpeed = 30; // km/h
    const timeInHours = distance / avgSpeed;
    const timeInMinutes = Math.ceil(timeInHours * 60);
    
    if (timeInMinutes < 1) return '1 min';
    if (timeInMinutes === 1) return '1 min';
    if (timeInMinutes < 60) return `${timeInMinutes} min`;
    const hours = Math.floor(timeInMinutes / 60);
    const mins = timeInMinutes % 60;
    return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
  }

  calculateDistanceRaw(lat1, lon1, lat2, lon2) {
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
        
        // Remove from job rooms
        this.jobRooms.forEach((jobInfo, jobId) => {
          if (jobInfo.providerId === userId || jobInfo.customerId === userId) {
            const roomName = jobInfo.roomName;
            this.broadcastToRoom(roomName, {
              type: 'user_disconnected',
              data: {
                userId,
                userType,
                timestamp: new Date().toISOString()
              }
            });
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
      const distance = this.calculateDistanceRaw(
        lat, lng,
        location.latitude, location.longitude
      );
      
      if (distance <= radiusKm) {
        nearby.push(providerId);
      }
    });
    
    return nearby;
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

  // Helper method to get customer for a job
  getCustomerForJob(jobId) {
    for (const [customerId, currentJobId] of this.customerCurrentJobs.entries()) {
      if (currentJobId === jobId) {
        return customerId;
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
      totalJobRooms: this.jobRooms.size,
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