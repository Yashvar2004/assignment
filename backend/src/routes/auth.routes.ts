import { Router } from 'express';
import {
  getAuthUrl,
  handleCallback,
  checkConnection,
  disconnect,
  connectWithPat,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/hubspot', getAuthUrl);
router.get('/hubspot/callback', handleCallback);
router.post('/connect-pat', connectWithPat);

// Protected routes
router.get('/status', authenticate, checkConnection);
router.post('/disconnect', authenticate, disconnect);

export default router;
