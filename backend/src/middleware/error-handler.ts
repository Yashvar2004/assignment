import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError, HubSpotApiError } from '../utils/errors';
import logger from '../utils/logger';
import { config } from '../config';

/**
 * Global error handling middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log the error
  logger.error('Unhandled error', {
    error: err.message,
    stack: config.nodeEnv === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Handle known error types
  if (err instanceof AppError) {
    const response: any = {
      success: false,
      error: {
        message: err.message,
        statusCode: err.statusCode,
      },
    };

    if (err instanceof ValidationError) {
      response.error.errors = err.errors;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  if (err instanceof HubSpotApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        hubspotStatus: err.hubspotStatus,
      },
    });
    return;
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    res.status(400).json({
      success: false,
      error: {
        message: 'Database operation failed',
        ...(config.nodeEnv === 'development' ? { details: err.message } : {}),
      },
    });
    return;
  }

  // Unknown errors
  res.status(500).json({
    success: false,
    error: {
      message:
        config.nodeEnv === 'production'
          ? 'Internal server error'
          : err.message,
    },
  });
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      statusCode: 404,
    },
  });
}
