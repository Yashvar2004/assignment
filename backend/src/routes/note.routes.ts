import { Router } from 'express';
import {
  createNote,
  getNotes,
  deleteNote,
  retryFailedSyncs,
  getNoteSyncStatus,
} from '../controllers/note.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Note operations
router.post('/contacts/:contactId/notes', createNote);
router.get('/contacts/:contactId/notes', getNotes);
router.delete('/notes/:noteId', deleteNote);

// Sync operations
router.post('/notes/retry-sync', retryFailedSyncs);
router.get('/notes/sync-status', getNoteSyncStatus);

export default router;
