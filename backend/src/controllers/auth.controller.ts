import { Request, Response, NextFunction } from 'express';
import { OAuthService } from '../services/oauth.service';
import { generateToken } from '../middleware/auth';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Get HubSpot OAuth authorization URL
 */
export async function getAuthUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const url = OAuthService.getAuthorizationUrl();
    res.json({ success: true, data: { url } });
  } catch (error) {
    next(error);
  }
}

/**
 * Handle HubSpot OAuth callback
 */
export async function handleCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      res.status(400).json({
        success: false,
        error: { message: 'Authorization code is required' },
      });
      return;
    }

    // Exchange code for tokens and store user
    const result = await OAuthService.handleCallback(code);

    // Generate JWT for our app
    const token = generateToken(result.userId);

    // Redirect to frontend with token
    const redirectUrl = new URL('/auth/callback', config.frontendUrl);
    redirectUrl.searchParams.set('token', token);
    redirectUrl.searchParams.set('portalName', result.portalName || '');

    res.redirect(redirectUrl.toString());
  } catch (error: any) {
    logger.error('OAuth callback error', { error: error.message });

    // Redirect to frontend with error
    const redirectUrl = new URL('/auth/callback', config.frontendUrl);
    redirectUrl.searchParams.set('error', error.message || 'Authentication failed');
    res.redirect(redirectUrl.toString());
  }
}

/**
 * Check current connection status
 */
export async function checkConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;

    const status = await OAuthService.checkConnection(userId);

    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
}

/**
 * Disconnect HubSpot account
 */
export async function disconnect(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;

    await OAuthService.disconnect(userId);

    res.json({
      success: true,
      data: { message: 'HubSpot account disconnected successfully' },
    });
  } catch (error) {
    next(error);
  }
}
