// middleware/auth.js
import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  console.log('='.repeat(50));
  console.log('🔐 AUTH MIDDLEWARE CALLED');
  console.log('='.repeat(50));
  
  try {
    const authHeader = req.headers['authorization'];
    console.log('Auth header:', authHeader);
    
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
      console.log('Decoded token:', decoded);
      
      // Check what's in the decoded token
      console.log('Token contains id:', decoded.id);
      console.log('Token contains _id:', decoded._id);
      console.log('Token contains userId:', decoded.userId);
      
      req.user = decoded;
      console.log('req.user set to:', req.user);
      console.log('Calling next()...');
      
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