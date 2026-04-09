import express from 'express';
import {
    savePushToken,
} from '../controllers/notificationController.js';

import { authMiddleware } from '../middleware/auth.js';


const router = express.Router();




router.use(authMiddleware);



router.post('/', savePushToken);





export default router;