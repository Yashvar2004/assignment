import { Request, Response, NextFunction } from 'express';
import { NoteService } from '../services/note.service';
import logger from '../utils/logger';

/**
 * Create a new note for a contact
 */
export async function createNote(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const { contactId } = req.params;
    const { body } = req.body;

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { message: 'Note body is required' },
      });
      return;
    }

    const note = await NoteService.createNote(userId, contactId as string, body.trim());

    res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get notes for a contact
 */
export async function getNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const { contactId } = req.params;
    const { page = '1', limit = '20' } = req.query as Record<string, string>;

    const result = await NoteService.getNotes(contactId as string, userId, {
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a note
 */
export async function deleteNote(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const { noteId } = req.params;

    await NoteService.deleteNote(noteId as string, userId);

    res.json({
      success: true,
      data: { message: 'Note deleted successfully' },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retry syncing failed notes to HubSpot
 */
export async function retryFailedSyncs(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;

    const result = await NoteService.retryFailedSyncs(userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get note sync status
 */
export async function getNoteSyncStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;

    const status = await NoteService.getNoteSyncStatus(userId);

    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
}
