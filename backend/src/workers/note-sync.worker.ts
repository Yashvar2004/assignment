import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config';
import prisma from '../config/database';
import { HubSpotService } from '../services/hubspot.service';
import { OAuthService } from '../services/oauth.service';
import logger from '../utils/logger';

interface NoteSyncJobData {
  noteId: string;
  userId: string;
  contactHubspotId: string;
  retryCount?: number;
}

/**
 * Worker that processes note synchronization jobs.
 * Syncs notes created in the app back to HubSpot as engagements.
 */
const noteSyncWorker = new Worker(
  'note-sync',
  async (job: Job<NoteSyncJobData>) => {
    const { noteId, userId, contactHubspotId, retryCount = 0 } = job.data;

    logger.info(`Processing note sync for note ${noteId}`, {
      retryCount,
    });

    try {
      // Get the note from database
      const note = await prisma.note.findUnique({
        where: { id: noteId },
      });

      if (!note) {
        logger.warn(`Note ${noteId} not found, skipping`);
        return { success: false, reason: 'Note not found' };
      }

      if (note.syncedToHubspot) {
        logger.info(`Note ${noteId} already synced, skipping`);
        return { success: true, reason: 'Already synced' };
      }

      // Get valid access token
      const accessToken = await OAuthService.getValidAccessToken(userId);
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        throw new Error('User not found');
      }

      // Create HubSpot client
      const redis = new Redis(config.redis.url);
      const hubspot = new HubSpotService(user.hubspotPortalId, redis);
      hubspot.setAccessToken(accessToken);

      // Create the note engagement in HubSpot
      const engagementId = await hubspot.createNote(contactHubspotId, note.body);

      // Mark note as synced
      await prisma.note.update({
        where: { id: noteId },
        data: {
          hubspotEngagementId: String(engagementId),
          syncedToHubspot: true,
          lastSyncError: null,
          lastSyncAttempt: new Date(),
        },
      });

      await redis.quit();

      logger.info(`Note ${noteId} synced to HubSpot as engagement ${engagementId}`);

      return {
        success: true,
        engagementId,
      };
    } catch (error: any) {
      logger.error(`Note sync failed for note ${noteId}`, {
        error: error.message,
        retryCount,
      });

      // Update note with error info
      await prisma.note.update({
        where: { id: noteId },
        data: {
          syncAttempts: { increment: 1 },
          lastSyncError: error.message,
          lastSyncAttempt: new Date(),
        },
      });

      // Check if we should retry
      const updatedNote = await prisma.note.findUnique({
        where: { id: noteId },
      });

      if ((updatedNote?.syncAttempts || 0) < config.sync.maxRetryAttempts) {
        // Let BullMQ handle the retry
        throw error;
      } else {
        logger.error(`Note ${noteId} exceeded max retry attempts`, {
          attempts: updatedNote?.syncAttempts,
        });
        return {
          success: false,
          reason: 'Max retries exceeded',
          error: error.message,
        };
      }
    }
  },
  {
    connection: {
      url: config.redis.url,
    },
    concurrency: 5, // Process 5 notes at a time
    limiter: {
      max: 20,
      duration: 1000, // 20 jobs per second
    },
  }
);

// Worker event handlers
noteSyncWorker.on('completed', (job) => {
  logger.debug(`Note sync job ${job.id} completed`);
});

noteSyncWorker.on('failed', (job, err) => {
  logger.error(`Note sync job ${job?.id} failed`, { error: err.message });
});

noteSyncWorker.on('error', (err) => {
  logger.error('Note sync worker error', { error: err.message });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Note sync worker shutting down...');
  await noteSyncWorker.close();
  process.exit(0);
});

export default noteSyncWorker;
