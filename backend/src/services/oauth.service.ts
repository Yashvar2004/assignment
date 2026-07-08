import prisma from '../config/database';
import { HubSpotService } from './hubspot.service';
import logger from '../utils/logger';
import { UnauthorizedError } from '../utils/errors';

/**
 * Manages HubSpot OAuth tokens including storage, refresh, and validation.
 */
export class OAuthService {
  /**
   * Initiate OAuth flow - returns the HubSpot authorization URL
   */
  static getAuthorizationUrl(): string {
    return HubSpotService.getAuthorizationUrl();
  }

  /**
   * Handle OAuth callback - exchange code for tokens and store them
   */
  static async handleCallback(code: string): Promise<any> {
    // Exchange code for tokens
    const tokens = await HubSpotService.exchangeCodeForTokens(code);

    // Get portal info to identify the account
    const tempHubspot = new HubSpotService('temp', require('../config/redis').default);
    tempHubspot.setAccessToken(tokens.accessToken);
    const portalInfo = await tempHubspot.getPortalInfo();

    const portalId = String(portalInfo.portalId);
    const portalName = portalInfo.accountName || `Portal ${portalId}`;

    // Calculate token expiry
    const tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    // Upsert user (create or update if portal already connected)
    const user = await prisma.user.upsert({
      where: { hubspotPortalId: portalId },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt,
        portalName,
        updatedAt: new Date(),
      },
      create: {
        hubspotPortalId: portalId,
        portalName,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt,
        scopes: config.hubspot.scopes,
      },
    });

    logger.info(`HubSpot account connected: ${portalName} (${portalId})`);

    return {
      userId: user.id,
      portalId,
      portalName,
    };
  }

  /**
   * Get valid access token for a user, refreshing if necessary
   */
  static async getValidAccessToken(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Check if token needs refresh (with 5 minute buffer)
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    const tokenExpiry = new Date(user.tokenExpiresAt);

    if (tokenExpiry.getTime() - bufferTime <= now.getTime()) {
      logger.info(`Refreshing token for user ${userId}`);

      try {
        const newTokens = await HubSpotService.refreshAccessToken(user.refreshToken);

        const newExpiry = new Date(Date.now() + newTokens.expiresIn * 1000);

        await prisma.user.update({
          where: { id: userId },
          data: {
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
            tokenExpiresAt: newExpiry,
          },
        });

        logger.info(`Token refreshed successfully for user ${userId}`);
        return newTokens.accessToken;
      } catch (error: any) {
        logger.error(`Token refresh failed for user ${userId}`, {
          error: error.message,
        });
        throw new UnauthorizedError('Token refresh failed. Please reconnect your HubSpot account.');
      }
    }

    return user.accessToken;
  }

  /**
   * Check if a user's HubSpot connection is valid
   */
  static async checkConnection(userId: string): Promise<{
    connected: boolean;
    portalName?: string;
    portalId?: string;
    tokenValid?: boolean;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return { connected: false };
    }

    // Try to validate the token
    try {
      const accessToken = await this.getValidAccessToken(userId);
      const hubspot = new HubSpotService(user.hubspotPortalId, require('../config/redis').default);
      hubspot.setAccessToken(accessToken);
      await hubspot.getPortalInfo();

      return {
        connected: true,
        portalName: user.portalName || undefined,
        portalId: user.hubspotPortalId,
        tokenValid: true,
      };
    } catch (error) {
      return {
        connected: true,
        portalName: user.portalName || undefined,
        portalId: user.hubspotPortalId,
        tokenValid: false,
      };
    }
  }

  /**
   * Disconnect a HubSpot account
   */
  static async disconnect(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return;
    }

    // Delete user and all associated data (cascading deletes)
    await prisma.user.delete({
      where: { id: userId },
    });

    logger.info(`HubSpot account disconnected: ${user.portalName} (${user.hubspotPortalId})`);
  }
}

// Import config at the bottom to avoid circular dependency
import { config } from '../config';

export default OAuthService;
