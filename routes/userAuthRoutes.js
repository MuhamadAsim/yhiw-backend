import express from 'express';
import {
  createUser,
  getUserByFirebaseId,
  updateUser,

} from '../controllers/userAuthController.js';

import { authenticateToken } from '../middleware/auth.js';




const router = express.Router();

// Public routes (for signup/signin)
router.post('/', createUser); // Signup
router.get('/:firebaseUserId', getUserByFirebaseId); // Signin



router.use(authenticateToken);

// Protected routes (add authentication middleware later)
router.put('/:firebaseUserId', updateUser); // Update profile





export default router;