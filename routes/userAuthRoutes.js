import express from 'express';
import {
  createUser,
  getUserByFirebaseId,
  updateUser,
  validateToken,
} from '../controllers/userAuthController.js';

import { authMiddleware} from '../middleware/auth.js';




const router = express.Router();

// Public routes (for signup/signin)
router.post('/', createUser); // Signup
router.get('/:firebaseUserId', getUserByFirebaseId); // Signin



router.use(authMiddleware);

// Protected routes (add authentication middleware later)
router.put('/:firebaseUserId', updateUser); // Update profile
router.get('/auth/validate', validateToken);






export default router;