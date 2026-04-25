import express from 'express';
import {
  createUser,
  getUserByFirebaseId,
  updateUser,
  validateToken,
} from '../controllers/userAuthController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ─── Public routes ────────────────────────────────────────────────────────────
router.post('/', createUser);                        // POST  /api/users        → Signup
router.get('/:firebaseUserId', getUserByFirebaseId); // GET   /api/users/:id    → Signin

// ─── Protected routes ─────────────────────────────────────────────────────────
router.use(authMiddleware);

router.get('/validate/token', validateToken);        // GET   /api/users/validate/token
router.put('/:firebaseUserId', updateUser);          // PUT   /api/users/:id    → Update profile

export default router;