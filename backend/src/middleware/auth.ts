import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errors';
import prisma from '../config/database';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * JWT token payload interface
 */
interface TokenPayload {
  userId: string;
  iat: number;
  exp: number;
}

/**
 * Authentication middleware.
 * Validates JWT token and attaches userId to request.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError('No authorization header');
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;

    // Attach userId to request
    req.userId = decoded.userId;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
      return;
    }

    next(error);
  }
}

/**
 * Optional authentication middleware.
 * Attaches userId if token is present, but doesn't fail if missing.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      next();
      return;
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (token) {
      const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;
      req.userId = decoded.userId;
    }

    next();
  } catch (error) {
    // Ignore auth errors for optional auth
    next();
  }
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(userId: string): string {
  return jwt.sign({ userId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.secret) as TokenPayload;
}
