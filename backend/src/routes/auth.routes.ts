import { Router } from 'express';
import {
  getAuthUrl,
  handleCallback,
  checkConnection,
  disconnect,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/hubspot', getAuthUrl);
router.get('/hubspot/callback', handleCallback);

// Protected routes
router.get('/status', authenticate, checkConnection);
router.post('/disconnect', authenticate, disconnect);

export default router;
