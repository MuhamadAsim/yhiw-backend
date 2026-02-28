export const findProvider = async (req, res) => {
  try {
    // 1. Create job in database
    const job = await createJob(req.body);
    
    // 2. Get WebSocket manager from app
    const wsManager = req.app.get('wsManager');
    
    // 3. Find nearby providers based on pickup location
    const nearbyProviders = await findNearbyProviders(
      req.body.pickup.coordinates.lat,
      req.body.pickup.coordinates.lng,
      10 // 10km radius
    );
    
    // 4. Send job request via WebSocket to all nearby providers
    const sentCount = wsManager.sendJobRequestToProviders({
      jobId: job._id,
      bookingId: job.bookingId,
      customerName: req.body.customer.name,
      customerId: req.body.customer.id,
      serviceType: job.serviceCategory,
      serviceName: job.serviceName,
      pickupLocation: req.body.pickup.address,
      pickupLat: req.body.pickup.coordinates.lat,
      pickupLng: req.body.pickup.coordinates.lng,
      dropoffLocation: req.body.dropoff?.address,
      dropoffLat: req.body.dropoff?.coordinates?.lat,
      dropoffLng: req.body.dropoff?.coordinates?.lng,
      distance: calculateDistance(req.body.pickup.coordinates, req.body.dropoff?.coordinates),
      estimatedEarnings: job.payment.totalAmount,
      price: job.payment.totalAmount,
      urgency: req.body.additionalDetails.urgency || 'normal',
      description: req.body.additionalDetails.description,
      vehicleDetails: req.body.vehicle
    }, nearbyProviders.map(p => p.firebaseUserId));
    
    // 5. Return response to customer
    res.status(201).json({
      success: true,
      bookingId: job.bookingId || job._id,
      message: `Job request sent to ${sentCount} nearby providers`
    });
    
  } catch (error) {
    console.error('Error in findProvider:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};