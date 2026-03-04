// middleware/auth.js
import jwt from 'jsonwebtoken';

export const authMiddleware = (req, res, next) => {
  console.log('='.repeat(50));
  console.log('🔐 AUTH MIDDLEWARE CALLED');
  console.log('='.repeat(50));
  
  try {
    const authHeader = req.headers['authorization'];
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.log('❌ No authorization header');
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const token = authHeader.split(' ')[1];
    console.log('Token extracted:', token ? token.substring(0, 30) + '...' : 'No token');
    
    if (!token) {
      console.log('❌ No token in auth header');
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    console.log('Verifying token with secret:', process.env.JWT_SECRET ? 'Secret exists' : 'Using default secret');
    
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, decoded) => {
      if (err) {
        console.log('❌ JWT Verification Error:', err.message);
        console.log('Error details:', err);
        return res.status(403).json({
          success: false,
          message: 'Invalid or expired token',
          error: err.message
        });
      }
      
      console.log('✅ Token verified successfully');
      console.log('Decoded token:', JSON.stringify(decoded, null, 2));
      
      // Check what's in the decoded token
      console.log('\n🔍 CHECKING FOR USER ID IN TOKEN:');
      console.log('- decoded.id:', decoded.id);
      console.log('- decoded._id:', decoded._id);
      console.log('- decoded.userId:', decoded.userId);
      console.log('- decoded.uid:', decoded.uid);
      console.log('- decoded.sub:', decoded.sub);
      console.log('- decoded.firebaseUserId:', decoded.firebaseUserId);
      
      // IMPORTANT: Extract the best available ID and make it available as req.user.id
      // This ensures your controller can always access req.user.id
      let userId = null;
      
      // Try different possible ID fields in order of preference
      if (decoded.id) {
        userId = decoded.id;
        console.log('✅ Using decoded.id as userId:', userId);
      } else if (decoded._id) {
        userId = decoded._id;
        console.log('✅ Using decoded._id as userId:', userId);
      } else if (decoded.userId) {
        userId = decoded.userId;
        console.log('✅ Using decoded.userId as userId:', userId);
      } else if (decoded.uid) {
        userId = decoded.uid;
        console.log('✅ Using decoded.uid as userId:', userId);
      } else if (decoded.sub) {
        userId = decoded.sub;
        console.log('✅ Using decoded.sub as userId:', userId);
      } else if (decoded.firebaseUserId) {
        userId = decoded.firebaseUserId;
        console.log('✅ Using decoded.firebaseUserId as userId:', userId);
      }
      
      // Set req.user with the extracted ID and all original data
      req.user = {
        ...decoded,           // Keep all original decoded data
        id: userId,           // Ensure id is always set (what your controller expects)
        _id: decoded._id || userId,  // Keep _id if exists
        userId: decoded.userId || userId, // Keep userId if exists
        uid: decoded.uid || userId,    // Keep uid if exists
      };
      
      console.log('\n📦 FINAL req.user SET TO:');
      console.log(JSON.stringify({
        id: req.user.id,
        _id: req.user._id,
        userId: req.user.userId,
        uid: req.user.uid,
        email: req.user.email,
        role: req.user.role
      }, null, 2));
      
      if (!req.user.id) {
        console.log('⚠️ WARNING: No user ID could be extracted from token!');
      } else {
        console.log('✅ User ID successfully set to:', req.user.id);
      }
      
      console.log('\n➡️ Calling next()...');
      next();
    });
  } catch (error) {
    console.error('❌ Unexpected error in auth middleware:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error.message
    });
  }
};