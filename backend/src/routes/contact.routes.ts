import { Router } from 'express';
import {
  syncContacts,
  getContacts,
  getContactById,
  getSyncJobStatus,
  getSyncJobs,
  resumeSyncJob,
} from '../controllers/contact.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Contact operations
router.post('/sync', syncContacts);
router.get('/', getContacts);
router.get('/:id', getContactById);

// Sync job operations
router.get('/sync/jobs', getSyncJobs);
router.get('/sync/jobs/:jobId', getSyncJobStatus);
router.post('/sync/jobs/:jobId/resume', resumeSyncJob);

export default router;
