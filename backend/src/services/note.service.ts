import prisma from '../config/database';
import { HubSpotService } from './hubspot.service';
import { OAuthService } from './oauth.service';
import logger from '../utils/logger';
import { config } from '../config';

/**
 * Service for managing notes and their synchronization with HubSpot.
 */
export class NoteService {
  /**
   * Create a new note for a contact and sync it to HubSpot.
   */
  static async createNote(
    userId: string,
    contactId: string,
    body: string
  ): Promise<any> {
    // Verify the contact belongs to the user
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        userId,
      },
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    // Create note in database first
    const note = await prisma.note.create({
      data: {
        contactId,
        body,
        syncedToHubspot: false,
        syncAttempts: 0,
      },
    });

    // Attempt to sync to HubSpot immediately (inline, not background)
    try {
      await this.syncNoteToHubspot(note.id, userId, contact.hubspotId);
    } catch (error: any) {
      logger.error(`Note sync failed for note ${note.id}`, {
        error: error.message,
      });
      // Note is still saved, sync can be retried later
    }

    return note;
  }

  /**
   * Sync a specific note to HubSpot
   */
  static async syncNoteToHubspot(
    noteId: string,
    userId: string,
    contactHubspotId: string
  ): Promise<void> {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
    });

    if (!note || note.syncedToHubspot) {
      return;
    }

    try {
      // Get valid access token
      const accessToken = await OAuthService.getValidAccessToken(userId);
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        throw new Error('User not found');
      }

      // Create engagement in HubSpot
      const hubspot = new HubSpotService(user.hubspotPortalId);
      hubspot.setAccessToken(accessToken);

      const engagementId = await hubspot.createNote(contactHubspotId, note.body);

      // Mark as synced
      await prisma.note.update({
        where: { id: noteId },
        data: {
          hubspotEngagementId: String(engagementId),
          syncedToHubspot: true,
          lastSyncError: null,
          lastSyncAttempt: new Date(),
        },
      });

      logger.info(`Note ${noteId} synced to HubSpot as engagement ${engagementId}`);
    } catch (error: any) {
      // Update sync attempt info
      await prisma.note.update({
        where: { id: noteId },
        data: {
          syncAttempts: { increment: 1 },
          lastSyncError: error.message,
          lastSyncAttempt: new Date(),
        },
      });

      logger.error(`Failed to sync note ${noteId} to HubSpot`, {
        error: error.message,
        attempts: note.syncAttempts + 1,
      });

      throw error;
    }
  }

  /**
   * Retry syncing all failed notes for a user
   */
  static async retryFailedSyncs(userId: string): Promise<{
    total: number;
    retried: number;
    successful: number;
    failed: number;
  }> {
    const failedNotes = await prisma.note.findMany({
      where: {
        syncedToHubspot: false,
        syncAttempts: { lt: config.sync.maxRetryAttempts },
        contact: { userId },
      },
      include: {
        contact: {
          select: { hubspotId: true },
        },
      },
    });

    let successful = 0;
    let failed = 0;

    for (const note of failedNotes) {
      try {
        await this.syncNoteToHubspot(note.id, userId, note.contact.hubspotId);
        successful++;
      } catch (error) {
        failed++;
      }
    }

    return {
      total: failedNotes.length,
      retried: failedNotes.length,
      successful,
      failed,
    };
  }

  /**
   * Get notes for a contact
   */
  static async getNotes(
    contactId: string,
    userId: string,
    options?: {
      page?: number;
      limit?: number;
    }
  ): Promise<{
    notes: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20 } = options || {};
    const skip = (page - 1) * limit;

    // Verify contact belongs to user
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId },
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where: { contactId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.note.count({ where: { contactId } }),
    ]);

    return {
      notes,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Delete a note
   */
  static async deleteNote(noteId: string, userId: string): Promise<void> {
    const note = await prisma.note.findFirst({
      where: {
        id: noteId,
        contact: { userId },
      },
    });

    if (!note) {
      throw new Error('Note not found');
    }

    await prisma.note.delete({
      where: { id: noteId },
    });
  }

  /**
   * Get sync status for notes
   */
  static async getNoteSyncStatus(userId: string): Promise<{
    total: number;
    synced: number;
    pending: number;
    failed: number;
  }> {
    const where = { contact: { userId } };

    const [total, synced, pending, failed] = await Promise.all([
      prisma.note.count({ where }),
      prisma.note.count({ where: { ...where, syncedToHubspot: true } }),
      prisma.note.count({
        where: {
          ...where,
          syncedToHubspot: false,
          syncAttempts: 0,
        },
      }),
      prisma.note.count({
        where: {
          ...where,
          syncedToHubspot: false,
          syncAttempts: { gte: config.sync.maxRetryAttempts },
        },
      }),
    ]);

    return { total, synced, pending, failed };
  }
}

export default NoteService;
