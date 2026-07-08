import { Request, Response, NextFunction } from 'express';
import { ContactService } from '../services/contact.service';
import logger from '../utils/logger';

/**
 * Trigger contact sync from HubSpot
 */
export async function syncContacts(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;

    const result = await ContactService.syncContacts(userId);

    res.json({
      success: true,
      data: {
        message: 'Contact sync started',
        jobId: result.jobId,
        totalContacts: result.totalContacts,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get paginated list of contacts
 */
export async function getContacts(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const {
      page = '1',
      limit = '20',
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query as Record<string, string>;

    const result = await ContactService.getContacts(userId, {
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100), // Cap at 100
      search,
      sortBy,
      sortOrder: sortOrder as 'asc' | 'desc',
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * Get a single contact by ID
 */
export async function getContactById(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const contact = await ContactService.getContactById(id as string, userId);

    res.json({ success: true, data: contact });
  } catch (error) {
    next(error);
  }
}

/**
 * Get sync job status
 */
export async function getSyncJobStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { jobId } = req.params;

    const job = await ContactService.getSyncJobStatus(jobId as string);

    res.json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all sync jobs for the user
 */
export async function getSyncJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;

    const jobs = await ContactService.getSyncJobs(userId);

    res.json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
}

/**
 * Resume a failed sync job
 */
export async function resumeSyncJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { jobId } = req.params;

    await ContactService.resumeSyncJob(jobId as string);

    res.json({
      success: true,
      data: { message: 'Sync job resumed' },
    });
  } catch (error) {
    next(error);
  }
}
