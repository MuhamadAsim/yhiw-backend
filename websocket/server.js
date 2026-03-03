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
        case 'subscribe_to_job':
          this.handleSubscribeToJob(client, payload);
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
        
        // Job management - CRITICAL: ACCEPT JOB HANDLER
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
        
        // Dedicated room for assigned jobs
        case 'join_job_room':
          this.handleJoinJobRoom(client, payload);
          break;
        case 'leave_job_room':
          this.handleLeaveJobRoom(client, payload);
          break;
        case 'send_to_job_room':
          this.handleSendToJobRoom(client, payload);
          break;
        
        // Ping
        case 'ping':
          this.sendToUser(client.userId, {
            type: 'pong',
            data: { timestamp: new Date().toISOString() }
          });
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

  handleSubscribeToJob(client, { bookingId }) {
    if (!bookingId) return;
    
    const roomName = `job_${bookingId}`;
    
    // Find socketId for this user
    const socketId = this.getSocketIdForUser(client.userId);
    if (socketId) {
      this.handleSubscribe(socketId, { room: roomName });
    }
    
    console.log(`✅ ${client.userType} ${client.userId} subscribed to job ${bookingId}`);
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
    // Query the database and send status
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
      const jobRoom = `job_${currentJobId}`;
      
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
    }
  }

  handleRequestProviderLocation(client, { jobId, bookingId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`📍 Location requested for job ${jobIdentifier} by ${client.userId}`);
    
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
    
    if (client.userType === 'provider') {
      const jobRoom = `job_${jobIdentifier}`;
      const jobInfo = this.jobRooms.get(jobIdentifier);
      
      if (jobInfo && jobInfo.customerId) {
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

  // CRITICAL: ACCEPT JOB HANDLER
  async handleAcceptJob(client, { jobId, bookingId, acceptedAt }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`✅✅✅ Provider ${client.userId} ACCEPTED job ${jobIdentifier}`);
    
    try {
      // Find the job in database
      const job = await Job.findById(jobIdentifier);
      
      if (!job) {
        console.error('Job not found:', jobIdentifier);
        return;
      }

      // Get provider details from database
      const provider = await User.findOne({ firebaseUserId: client.userId });
      
      if (!provider) {
        console.error('Provider not found:', client.userId);
        return;
      }

      // Update job in database
      job.status = 'accepted';
      job.acceptedAt = new Date();
      job.providerId = provider._id;
      job.provider = {
        providerId: provider._id,
        name: provider.fullName,
        phone: provider.phone,
        rating: provider.rating || 4.5,
        profileImage: provider.profileImage || '',
        vehicleDetails: provider.vehicleDetails || '',
        acceptedAt: new Date(),
        estimatedArrival: '10-15 minutes'
      };
      await job.save();

      console.log('✅ Job updated in database:', job._id);

      // Get customer ID from job
      const customerUser = await User.findById(job.customerId);
      const customerFirebaseId = customerUser?.firebaseUserId;

      // Create comprehensive provider data for customer
      const providerData = {
        bookingId: job.bookingId,
        jobId: job._id.toString(),
        providerId: client.userId,
        providerName: provider.fullName || 'Provider',
        providerRating: provider.rating || 4.5,
        providerImage: provider.profileImage || '',
        estimatedArrival: '10-15 minutes',
        vehicleDetails: provider.vehicleDetails || '',
        providerPhone: provider.phone || '',
        licensePlate: provider.licensePlate || '',
        provider: {
          id: client.userId,
          name: provider.fullName || 'Provider',
          rating: provider.rating || 4.5,
          profileImage: provider.profileImage || '',
          vehicleDetails: provider.vehicleDetails || '',
          phone: provider.phone || '',
          licensePlate: provider.licensePlate || ''
        }
      };

      console.log('📦 Provider data prepared:', JSON.stringify(providerData, null, 2));

      // Send to customer via WebSocket (multiple message types for redundancy)
      if (customerFirebaseId) {
        // Send job_accepted (what frontend listens for)
        this.sendToUser(customerFirebaseId, {
          type: 'job_accepted',
          data: providerData
        });
        
        // Send provider_assigned (backup)
        this.sendToUser(customerFirebaseId, {
          type: 'provider_assigned',
          data: providerData
        });
        
        // Send booking_accepted (another backup)
        this.sendToUser(customerFirebaseId, {
          type: 'booking_accepted',
          data: providerData
        });

        console.log(`📨 Sent acceptance notifications to customer ${customerFirebaseId}`);
      }

      // Create job room for real-time communication
      const roomName = `job_${jobIdentifier}`;
      
      // Subscribe provider to job room
      const providerSocketId = this.getSocketIdForUser(client.userId);
      if (providerSocketId) {
        this.handleSubscribe(providerSocketId, { room: roomName });
      }
      
      // Store job in maps
      this.providerCurrentJobs.set(client.userId, jobIdentifier);
      
      if (customerFirebaseId) {
        this.customerCurrentJobs.set(customerFirebaseId, jobIdentifier);
      }

      // Store job room info
      this.jobRooms.set(jobIdentifier, {
        providerId: client.userId,
        customerId: customerFirebaseId,
        roomName,
        createdAt: new Date().toISOString()
      });

      // If customer is online, also subscribe them to the job room
      if (customerFirebaseId) {
        const customerSocketId = this.getSocketIdForUser(customerFirebaseId);
        if (customerSocketId) {
          this.handleSubscribe(customerSocketId, { room: roomName });
        }
      }

      console.log(`✅ Job ${jobIdentifier} fully processed, room ${roomName} created`);

    } catch (error) {
      console.error('❌ Error in handleAcceptJob:', error);
    }
  }

  handleDeclineJob(client, { jobId, bookingId, reason }) {
    console.log(`❌ Provider ${client.userId} declined job ${jobId || bookingId}`);
    
    const jobIdentifier = jobId || bookingId;
    
    // Remove from viewers
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
    
    // Subscribe to job room for updates
    const socketId = this.getSocketIdForUser(client.userId);
    if (socketId) {
      this.handleSubscribe(socketId, { room: `job_${jobIdentifier}` });
    }
  }

  handleEnRoute(client, { jobId, bookingId, eta }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`🚗 Provider ${client.userId} is en-route to job ${jobIdentifier}`);
    
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

  handleStartTracking(client, { jobId, bookingId, providerId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`👀 ${client.userType} ${client.userId} started tracking job ${jobIdentifier}`);
    
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

  handleStopTracking(client, { jobId, bookingId, providerId }) {
    const jobIdentifier = jobId || bookingId;
    console.log(`🚫 ${client.userType} ${client.userId} stopped tracking job ${jobIdentifier}`);
    
    const roomName = `job_${jobIdentifier}`;
    const socketId = this.getSocketIdForUser(client.userId);
    this.handleUnsubscribe(socketId, { room: roomName });
    
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

  cleanupJobRoom(jobId) {
    if (this.jobRooms.has(jobId)) {
      const jobInfo = this.jobRooms.get(jobId);
      const roomName = jobInfo.roomName;
      
      if (this.rooms.has(roomName)) {
        this.rooms.delete(roomName);
      }
      
      this.jobRooms.delete(jobId);
      console.log(`🧹 Cleaned up job room for ${jobId}`);
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
        expiresAt: new Date(Date.now() + 60000).toISOString()
      }
    };

    let sentCount = 0;
    providerIds.forEach(providerId => {
      if (this.sendToUser(providerId, message)) {
        sentCount++;
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

  deg2rad(deg) {
    return deg * (Math.PI/180);
  }

  getProviderForJob(jobId) {
    for (const [providerId, currentJobId] of this.providerCurrentJobs.entries()) {
      if (currentJobId === jobId) {
        return providerId;
      }
    }
    return null;
  }

  getCustomerForJob(jobId) {
    for (const [customerId, currentJobId] of this.customerCurrentJobs.entries()) {
      if (currentJobId === jobId) {
        return customerId;
      }
    }
    return null;
  }

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
        
        // If provider, update offline status in DB
        if (userType === 'provider') {
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
              this.userLocations.delete(userId);
            }
          }, 30000);
        }
        
        console.log(`🔌 WebSocket disconnected: ${userId} (all sockets)`);
      }
    }
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