import { Request, Response, NextFunction } from 'express';
import { OAuthService } from '../services/oauth.service';
import { generateToken } from '../middleware/auth';
import { config } from '../config';
import logger from '../utils/logger';
import prisma from '../config/database';
import { HubSpotService } from '../services/hubspot.service';

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

/**
 * Connect using Personal Access Token (PAT) - simpler than OAuth
 */
export async function connectWithPat(req: Request, res: Response, next: NextFunction) {
  try {
    const patToken = config.hubspot.patToken;

    if (!patToken) {
      res.status(400).json({
        success: false,
        error: { message: 'No PAT token configured. Set HUBSPOT_PAT_TOKEN in .env' },
      });
      return;
    }

    // Test the PAT token by getting portal info
    const hubspot = new HubSpotService('temp');
    hubspot.setAccessToken(patToken);

    let portalInfo;
    try {
      portalInfo = await hubspot.getPortalInfo();
    } catch (error: any) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid PAT token. Please check your token.' },
      });
      return;
    }

    const portalId = String(portalInfo.portalId);
    const portalName = portalInfo.accountName || `Portal ${portalId}`;

    // Create or update user with PAT token
    const user = await prisma.user.upsert({
      where: { hubspotPortalId: portalId },
      update: {
        accessToken: patToken,
        refreshToken: 'pat-refresh',
        tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        portalName,
        updatedAt: new Date(),
      },
      create: {
        hubspotPortalId: portalId,
        portalName,
        accessToken: patToken,
        refreshToken: 'pat-refresh',
        tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        scopes: 'contacts,tickets,timeline',
      },
    });

    // Generate JWT for our app
    const token = generateToken(user.id);

    logger.info(`HubSpot connected via PAT: ${portalName} (${portalId})`);

    res.json({
      success: true,
      data: {
        token,
        portalName,
        portalId,
        message: 'Connected to HubSpot via Personal Access Token',
      },
    });
  } catch (error) {
    next(error);
  }
}
