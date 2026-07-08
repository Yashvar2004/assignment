import { Worker, Job } from 'bullmq';
import { config } from '../config';
import prisma from '../config/database';
import { HubSpotService } from '../services/hubspot.service';
import { OAuthService } from '../services/oauth.service';
import logger from '../utils/logger';

interface ContactSyncJobData {
  userId: string;
  jobId: string;
  cursor?: string;
  batchNumber?: number;
}

/**
 * Worker that processes contact synchronization jobs.
 * Only used when Redis is available (not in Vercel serverless).
 */
const contactSyncWorker = new Worker(
  'contact-sync',
  async (job: Job<ContactSyncJobData>) => {
    const { userId, jobId, cursor, batchNumber = 0 } = job.data;

    logger.info(`Processing contact sync job ${jobId}, batch ${batchNumber}`, {
      cursor,
    });

    try {
      // Get valid access token (refreshes if needed)
      const accessToken = await OAuthService.getValidAccessToken(userId);
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        throw new Error('User not found');
      }

      // Create HubSpot client
      const hubspot = new HubSpotService(user.hubspotPortalId);
      hubspot.setAccessToken(accessToken);

      // Fetch a batch of contacts
      const response = await hubspot.getContacts({
        after: cursor,
        limit: config.sync.contactBatchSize,
      });

      const contacts = response.results;

      if (contacts.length === 0) {
        logger.info(`No more contacts to sync for job ${jobId}`);
        return { done: true, processed: 0 };
      }

      // Upsert contacts in batch (idempotent operations)
      let processed = 0;
      let failed = 0;

      const upsertPromises = contacts.map(async (contact) => {
        try {
          await prisma.contact.upsert({
            where: { hubspotId: contact.id },
            update: {
              email: contact.properties.email || null,
              firstName: contact.properties.firstname || null,
              lastName: contact.properties.lastname || null,
              phone: contact.properties.phone || null,
              company: contact.properties.company || null,
              jobTitle: contact.properties.jobtitle || null,
              lifecycleStage: contact.properties.lifecyclestage || null,
              leadStatus: contact.properties.hs_lead_status || null,
              city: contact.properties.city || null,
              country: contact.properties.country || null,
              hsCreatedAt: contact.createdAt ? new Date(contact.createdAt) : null,
              hsUpdatedAt: contact.updatedAt ? new Date(contact.updatedAt) : null,
              lastSyncedAt: new Date(),
            },
            create: {
              hubspotId: contact.id,
              userId,
              email: contact.properties.email || null,
              firstName: contact.properties.firstname || null,
              lastName: contact.properties.lastname || null,
              phone: contact.properties.phone || null,
              company: contact.properties.company || null,
              jobTitle: contact.properties.jobtitle || null,
              lifecycleStage: contact.properties.lifecyclestage || null,
              leadStatus: contact.properties.hs_lead_status || null,
              city: contact.properties.city || null,
              country: contact.properties.country || null,
              hsCreatedAt: contact.createdAt ? new Date(contact.createdAt) : null,
              hsUpdatedAt: contact.updatedAt ? new Date(contact.updatedAt) : null,
              lastSyncedAt: new Date(),
            },
          });
          processed++;
        } catch (error: any) {
          failed++;
          logger.error(`Failed to upsert contact ${contact.id}`, {
            error: error.message,
          });
        }
      });

      await Promise.all(upsertPromises);

      // Update sync job progress
      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          processed: { increment: processed },
          failed: { increment: failed },
          cursor: response.paging?.next?.after || null,
        },
      });

      // If there are more pages, enqueue the next batch
      if (response.paging?.next?.after) {
        const { contactSyncQueue } = await import('../queues/index');
        await contactSyncQueue.add(
          'sync-batch',
          {
            userId,
            jobId,
            cursor: response.paging.next.after,
            batchNumber: batchNumber + 1,
          },
          {
            priority: 1, // High priority for continuation
          }
        );
      } else {
        // Sync complete - update job status
        const syncJob = await prisma.syncJob.findUnique({ where: { id: jobId } });
        await prisma.syncJob.update({
          where: { id: jobId },
          data: {
            status: (syncJob?.failed || 0) + failed > 0 ? 'completed_with_errors' : 'completed',
            completedAt: new Date(),
          },
        });

        logger.info(`Contact sync completed for job ${jobId}`);
      }

      return {
        done: !response.paging?.next?.after,
        processed,
        failed,
        nextCursor: response.paging?.next?.after,
      };
    } catch (error: any) {
      logger.error(`Contact sync job ${jobId} failed`, {
        error: error.message,
        batchNumber,
      });

      // Update job status on failure
      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: error.message,
          completedAt: new Date(),
        },
      });

      throw error; // Let BullMQ handle retry
    }
  },
  {
    connection: {
      url: config.redis.url,
    },
    concurrency: config.sync.concurrentWorkers,
    limiter: {
      max: 10,
      duration: 1000, // 10 jobs per second
    },
  }
);

// Worker event handlers
contactSyncWorker.on('completed', (job) => {
  logger.debug(`Contact sync job ${job.id} completed`);
});

contactSyncWorker.on('failed', (job, err) => {
  logger.error(`Contact sync job ${job?.id} failed`, { error: err.message });
});

contactSyncWorker.on('error', (err) => {
  logger.error('Contact sync worker error', { error: err.message });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Contact sync worker shutting down...');
  await contactSyncWorker.close();
  process.exit(0);
});

export default contactSyncWorker;
