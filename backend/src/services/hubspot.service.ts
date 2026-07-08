import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import logger from '../utils/logger';
import { HubSpotApiError, RateLimitError } from '../utils/errors';
import { withRetry, sleep } from '../utils/retry';

interface HubSpotTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

interface HubSpotContact {
  id: string;
  properties: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

interface HubSpotPaginatedResponse<T> {
  results: T[];
  paging?: {
    next?: {
      after: string;
      link: string;
    };
  };
  total?: number;
}

/**
 * HubSpot API client with retry logic.
 * Works in serverless environments without Redis dependency.
 */
export class HubSpotService {
  private client: AxiosInstance;
  private portalId: string;
  private requestCount: number = 0;
  private windowStart: number = Date.now();

  constructor(portalId: string) {
    this.portalId = portalId;

    this.client = axios.create({
      baseURL: config.hubspot.apiBaseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          const status = error.response.status;
          const data = error.response.data as any;

          if (status === 429) {
            const retryAfter = parseInt(
              (error.response.headers['retry-after'] as string) || '10',
              10
            );
            throw new RateLimitError(retryAfter * 1000);
          }

          throw new HubSpotApiError(
            data?.message || `HubSpot API error: ${status}`,
            status,
            data
          );
        }
        throw error;
      }
    );
  }

  /**
   * Simple rate limiting without Redis (for serverless)
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const windowMs = config.sync.rateLimitWindow;

    // Reset window if expired
    if (now - this.windowStart > windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    // Check if we're at the limit
    if (this.requestCount >= config.sync.rateLimitRequests) {
      const waitTime = windowMs - (now - this.windowStart) + 100;
      if (waitTime > 0) {
        logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
        await sleep(waitTime);
        this.requestCount = 0;
        this.windowStart = Date.now();
      }
    }

    this.requestCount++;
  }

  /**
   * Set the access token for authenticated requests
   */
  setAccessToken(token: string): void {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  // ==================== OAuth Methods ====================

  /**
   * Generate the HubSpot OAuth authorization URL
   */
  static getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      client_id: config.hubspot.clientId,
      redirect_uri: config.hubspot.redirectUri,
      scope: config.hubspot.scopes,
      response_type: 'code',
    });

    return `${config.hubspot.authBaseUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access and refresh tokens
   */
  static async exchangeCodeForTokens(code: string): Promise<HubSpotTokens> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.hubspot.clientId,
      client_secret: config.hubspot.clientSecret,
      redirect_uri: config.hubspot.redirectUri,
      code,
    });

    try {
      const response = await axios.post(config.hubspot.tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type,
      };
    } catch (error: any) {
      logger.error('Failed to exchange code for tokens', {
        error: error.response?.data || error.message,
      });
      throw new HubSpotApiError(
        'Failed to exchange authorization code',
        error.response?.status || 500,
        error.response?.data
      );
    }
  }

  /**
   * Refresh an expired access token using the refresh token
   */
  static async refreshAccessToken(refreshToken: string): Promise<HubSpotTokens> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.hubspot.clientId,
      client_secret: config.hubspot.clientSecret,
      refresh_token: refreshToken,
    });

    try {
      const response = await axios.post(config.hubspot.tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type,
      };
    } catch (error: any) {
      logger.error('Failed to refresh access token', {
        error: error.response?.data || error.message,
      });
      throw new HubSpotApiError(
        'Failed to refresh access token',
        error.response?.status || 500,
        error.response?.data
      );
    }
  }

  // ==================== Contact Methods ====================

  /**
   * Fetch contacts with pagination support.
   */
  async getContacts(options?: {
    after?: string;
    limit?: number;
    properties?: string[];
  }): Promise<HubSpotPaginatedResponse<HubSpotContact>> {
    const {
      after,
      limit = config.sync.contactBatchSize,
      properties = [
        'email',
        'firstname',
        'lastname',
        'phone',
        'company',
        'jobtitle',
        'lifecyclestage',
        'hs_lead_status',
        'city',
        'country',
        'createdate',
        'lastmodifieddate',
      ],
    } = options || {};

    return withRetry(
      async () => {
        // Wait for rate limit
        await this.waitForRateLimit();

        const params: Record<string, any> = {
          limit,
          properties: properties.join(','),
          archived: false,
        };

        if (after) {
          params.after = after;
        }

        logger.debug(`Fetching contacts from HubSpot`, { after, limit });

        const response = await this.client.get('/crm/v3/objects/contacts', { params });
        return response.data;
      },
      {
        maxAttempts: config.sync.maxRetryAttempts,
        onRetry: (attempt, error) => {
          logger.warn(`Retrying getContacts (attempt ${attempt})`, {
            error: error.message,
          });
        },
      }
    );
  }

  /**
   * Get total contact count for the portal
   */
  async getContactCount(): Promise<number> {
    await this.waitForRateLimit();

    try {
      const response = await this.client.get('/crm/v3/objects/contacts', {
        params: { limit: 1 },
      });
      return response.data.total || 0;
    } catch (error) {
      logger.error('Failed to get contact count', { error });
      return 0;
    }
  }

  // ==================== Engagement (Notes) Methods ====================

  /**
   * Create a note engagement and associate it with a contact
   */
  async createNote(contactHubspotId: string, body: string): Promise<number> {
    return withRetry(
      async () => {
        await this.waitForRateLimit();

        const timestamp = Date.now();

        // Create the engagement
        const engagementResponse = await this.client.post('/engagements/v1/engagements', {
          engagement: {
            type: 'NOTE',
            timestamp,
          },
          associations: {
            contactIds: [parseInt(contactHubspotId, 10)],
            companyIds: [],
            dealIds: [],
            ownerIds: [],
          },
          metadata: {
            body,
          },
        });

        const engagementId = engagementResponse.data.engagement.id;
        logger.info(`Created note engagement ${engagementId} for contact ${contactHubspotId}`);

        return engagementId;
      },
      {
        maxAttempts: config.sync.maxRetryAttempts,
        onRetry: (attempt) => {
          logger.warn(`Retrying createNote (attempt ${attempt})`, {
            contactHubspotId,
          });
        },
      }
    );
  }

  /**
   * Get notes/engagements for a specific contact
   */
  async getContactNotes(contactHubspotId: string): Promise<any[]> {
    await this.waitForRateLimit();

    try {
      const response = await this.client.get(
        `/engagements/v1/engagements/associated/CONTACT/${contactHubspotId}/paged`,
        {
          params: {
            limit: 100,
            engagementType: 'NOTE',
          },
        }
      );

      return response.data.results || [];
    } catch (error: any) {
      logger.error('Failed to get contact notes', {
        contactHubspotId,
        error: error.message,
      });
      return [];
    }
  }

  // ==================== Utility Methods ====================

  /**
   * Get portal/account info to verify the connection
   */
  async getPortalInfo(): Promise<any> {
    await this.waitForRateLimit();

    try {
      const response = await this.client.get('/account-info/v3/details');
      return response.data;
    } catch (error: any) {
      logger.error('Failed to get portal info', { error: error.message });
      throw error;
    }
  }
}

export default HubSpotService;
