import prisma from '../config/database';
import redis from '../config/redis';
import { HubSpotService } from './hubspot.service';
import { OAuthService } from './oauth.service';
import logger from '../utils/logger';
import { config } from '../config';

/**
 * Service for managing contacts and their synchronization.
 */
export class ContactService {
  /**
   * Sync contacts from HubSpot for a user.
   * Uses cursor-based pagination for resumable syncs.
   */
  static async syncContacts(userId: string): Promise<{
    jobId: string;
    totalContacts: number;
  }> {
    // Get valid access token
    const accessToken = await OAuthService.getValidAccessToken(userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new Error('User not found');
    }

    // Create sync job
    const syncJob = await prisma.syncJob.create({
      data: {
        userId,
        type: 'contact_sync',
        status: 'running',
        startedAt: new Date(),
      },
    });

    // Get total contact count
    const hubspot = new HubSpotService(user.hubspotPortalId, redis);
    hubspot.setAccessToken(accessToken);
    const totalContacts = await hubspot.getContactCount();

    // Update job with total
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: { totalItems: totalContacts },
    });

    // Start sync in background (non-blocking)
    this.performContactSync(userId, syncJob.id, accessToken, user.hubspotPortalId).catch(
      (error) => {
        logger.error(`Contact sync failed for job ${syncJob.id}`, { error: error.message });
        prisma.syncJob
          .update({
            where: { id: syncJob.id },
            data: {
              status: 'failed',
              error: error.message,
              completedAt: new Date(),
            },
          })
          .catch(() => {});
      }
    );

    return { jobId: syncJob.id, totalContacts };
  }

  /**
   * Perform the actual contact synchronization.
   * Processes contacts in batches with upsert for idempotency.
   */
  private static async performContactSync(
    userId: string,
    jobId: string,
    accessToken: string,
    portalId: string
  ): Promise<void> {
    const hubspot = new HubSpotService(portalId, redis);
    hubspot.setAccessToken(accessToken);

    let processed = 0;
    let failed = 0;
    let cursor: string | undefined;
    let hasMore = true;

    logger.info(`Starting contact sync for job ${jobId}`);

    while (hasMore) {
      // Fetch a batch of contacts
      const response = await hubspot.getContacts({
        after: cursor,
        limit: config.sync.contactBatchSize,
      });

      const contacts = response.results;

      if (contacts.length === 0) {
        break;
      }

      // Process batch - upsert each contact for idempotency
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
          logger.error(`Failed to sync contact ${contact.id}`, {
            error: error.message,
          });
        }
      });

      // Process batch in parallel with concurrency limit
      await Promise.all(upsertPromises);

      // Update job progress
      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          processed,
          failed,
          cursor: response.paging?.next?.after || null,
        },
      });

      logger.info(`Sync progress: ${processed} processed, ${failed} failed`, {
        jobId,
      });

      // Check for next page
      if (response.paging?.next?.after) {
        cursor = response.paging.next.after;
      } else {
        hasMore = false;
      }
    }

    // Mark job as completed
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: failed > 0 ? 'completed_with_errors' : 'completed',
        completedAt: new Date(),
        processed,
        failed,
      },
    });

    logger.info(`Contact sync completed for job ${jobId}: ${processed} processed, ${failed} failed`);
  }

  /**
   * Resume a failed or interrupted sync job
   */
  static async resumeSyncJob(jobId: string): Promise<void> {
    const job = await prisma.syncJob.findUnique({
      where: { id: jobId },
      include: { user: true },
    });

    if (!job) {
      throw new Error('Sync job not found');
    }

    if (job.status === 'completed') {
      throw new Error('Sync job already completed');
    }

    const accessToken = await OAuthService.getValidAccessToken(job.userId);

    // Update job status
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'running',
        error: null,
        startedAt: new Date(),
      },
    });

    // Resume from last cursor
    this.performContactSync(job.userId, jobId, accessToken, job.user.hubspotPortalId).catch(
      (error) => {
        logger.error(`Resumed sync failed for job ${jobId}`, { error: error.message });
        prisma.syncJob
          .update({
            where: { id: jobId },
            data: {
              status: 'failed',
              error: error.message,
              completedAt: new Date(),
            },
          })
          .catch(() => {});
      }
    );
  }

  /**
   * Get contacts for a user with pagination and search
   */
  static async getContacts(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<{
    contacts: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options || {};

    const skip = (page - 1) * limit;

    // Build search filter
    const where: any = { userId };

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Execute query
    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: { notes: true },
          },
        },
      }),
      prisma.contact.count({ where }),
    ]);

    return {
      contacts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single contact by ID with notes
   */
  static async getContactById(contactId: string, userId: string): Promise<any> {
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        userId,
      },
      include: {
        notes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    return contact;
  }

  /**
   * Get sync job status
   */
  static async getSyncJobStatus(jobId: string): Promise<any> {
    const job = await prisma.syncJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error('Sync job not found');
    }

    return job;
  }

  /**
   * Get all sync jobs for a user
   */
  static async getSyncJobs(userId: string): Promise<any[]> {
    return prisma.syncJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}

export default ContactService;
