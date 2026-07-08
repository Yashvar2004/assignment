import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  database: {
    url: process.env.DATABASE_URL!,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  hubspot: {
    clientId: process.env.HUBSPOT_CLIENT_ID!,
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET!,
    redirectUri: process.env.HUBSPOT_REDIRECT_URI || 'http://localhost:3001/api/auth/hubspot/callback',
    scopes: [
      'oauth',
      'contacts',
      'tickets',
      'timeline',
      'e-commerce',
    ].join(' '),
    apiBaseUrl: 'https://api.hubapi.com',
    authBaseUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'default-dev-secret-change-in-production',
    expiresIn: '7d',
  },

  sync: {
    contactBatchSize: 100,        // HubSpot max per page
    noteBatchSize: 50,            // Notes per batch
    maxRetryAttempts: 5,          // Max retries for failed operations
    retryBackoffBase: 1000,       // 1 second base backoff
    maxRetryBackoff: 60000,       // 60 second max backoff
    rateLimitRequests: 100,       // HubSpot: 100 requests
    rateLimitWindow: 10000,       // per 10 seconds
    concurrentWorkers: 3,         // Parallel sync workers
    jobLockDuration: 30000,       // 30 second job lock
  },
} as const;

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL', 'HUBSPOT_CLIENT_ID', 'HUBSPOT_CLIENT_SECRET'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`Warning: Missing environment variable: ${envVar}`);
  }
}
