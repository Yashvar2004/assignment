const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const rateLimit = require('express-rate-limit');

// ==================== VALIDATION ====================
// Fail fast if required env vars are missing
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'DATABASE_URL'];
for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    console.error(`FATAL: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// ==================== INITIALIZATION ====================
const JWT_SECRET = process.env.JWT_SECRET; // No fallback - must be set via env var

let prisma = null;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
  console.log('Prisma initialized successfully');
} catch (err) {
  console.error('Prisma initialization failed:', err.message);
}

const app = express();

// ==================== RATE LIMITING ====================
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { success: false, error: { message: 'Too many requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

const syncLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 sync requests per minute
  message: { success: false, error: { message: 'Sync rate limit exceeded, please wait' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use(generalLimiter);

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://hubspot-sync-frontend.vercel.app',
    /\.vercel\.app$/,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==================== JWT FUNCTIONS ====================
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Authentication middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
  }
  try {
    const decoded = verifyToken(authHeader.split(' ')[1]);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: { message: 'Invalid token' } });
  }
}

// ==================== RATE LIMITER FOR HUBSPOT API ====================
// HubSpot allows 100 requests per 10 seconds
const hubspotRateLimiter = {
  requests: 0,
  windowStart: Date.now(),
  maxRequests: 100,
  windowMs: 10000, // 10 seconds

  async waitIfNeeded() {
    const now = Date.now();
    if (now - this.windowStart > this.windowMs) {
      this.requests = 0;
      this.windowStart = now;
    }
    if (this.requests >= this.maxRequests) {
      const waitTime = this.windowMs - (now - this.windowStart) + 100;
      console.log(`Rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requests = 0;
      this.windowStart = Date.now();
    }
    this.requests++;
  }
};

// ==================== TOKEN REFRESH ====================
async function refreshHubspotToken(userId) {
  if (!prisma) throw new Error('Database not available');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  // Check if token needs refresh (5 minutes before expiry)
  const now = new Date();
  const bufferTime = 5 * 60 * 1000; // 5 minutes
  const tokenExpiry = new Date(user.tokenExpiresAt);

  if (tokenExpiry.getTime() - bufferTime > now.getTime()) {
    // Token still valid, no refresh needed
    return user.accessToken;
  }

  // Skip refresh for PAT tokens
  if (user.refreshToken === 'pat-refresh') {
    return user.accessToken;
  }

  console.log(`Refreshing token for user ${userId}`);

  try {
    const response = await axios.post('https://api.hubapi.com/oauth/v1/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        refresh_token: user.refreshToken,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const newExpiry = new Date(Date.now() + expires_in * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: newExpiry,
      },
    });

    console.log(`Token refreshed successfully for user ${userId}`);
    return access_token;
  } catch (error) {
    console.error(`Token refresh failed for user ${userId}:`, error.message);
    throw new Error('Token refresh failed. Please reconnect your HubSpot account.');
  }
}

// ==================== RETRY UTILITY ====================
async function withRetry(fn, options = {}) {
  const { maxAttempts = 5, backoffBase = 1000, maxBackoff = 60000, onRetry } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;

      // Check if error is retryable (429 rate limit or 5xx server error)
      const isRetryable = error.response?.status === 429 ||
                         (error.response?.status >= 500 && error.response?.status < 600);

      if (!isRetryable) throw error;

      const backoff = Math.min(backoffBase * Math.pow(2, attempt - 1), maxBackoff);
      const jitter = backoff * (0.5 + Math.random() * 0.5);

      if (onRetry) onRetry(attempt, error);

      console.log(`Retry attempt ${attempt}/${maxAttempts} after ${Math.round(jitter)}ms`);
      await new Promise(resolve => setTimeout(resolve, jitter));
    }
  }
}

// ==================== USER AUTHENTICATION ====================

// Password hashing using crypto (no bcrypt dependency needed)
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

// Register new user
app.post('/api/auth/register', async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }

  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: { message: 'Email and password are required' } });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: { message: 'Password must be at least 6 characters' } });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ success: false, error: { message: 'Email already registered' } });
    }

    // Create user
    const hashedPassword = hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || email.split('@')[0],
      },
    });

    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name },
        message: 'Account created successfully',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: { message: 'Email and password are required' } });
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, error: { message: 'Invalid email or password' } });
    }

    // Verify password
    if (!verifyPassword(password, user.password)) {
      return res.status(401).json({ success: false, error: { message: 'Invalid email or password' } });
    }

    const token = generateToken(user.id);

    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name },
        hubspotConnected: !!user.hubspotPortalId,
        message: 'Login successful',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Get current user profile
app.get('/api/auth/me', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true, hubspotPortalId: true, portalName: true, createdAt: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// ==================== HEALTH CHECK ====================
app.get('/health', async (req, res) => {
  try {
    if (prisma) {
      await prisma.$queryRaw`SELECT 1`;
    }
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: prisma ? 'connected' : 'not available',
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: { status: 'unhealthy', message: error.message },
    });
  }
});

// ==================== OAUTH ROUTES ====================

// Get HubSpot OAuth authorization URL
app.get('/api/auth/hubspot', (req, res) => {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI || `${process.env.FRONTEND_URL}/auth/callback`;

  if (!clientId) {
    return res.status(400).json({
      success: false,
      error: { message: 'HubSpot OAuth not configured. Please set HUBSPOT_CLIENT_ID environment variable.' },
    });
  }

  const scopes = ['oauth', 'contacts', 'tickets', 'timeline'].join(' ');
  const url = `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code`;

  res.json({ success: true, data: { url } });
});

// Handle OAuth callback
app.get('/api/auth/hubspot/callback', async (req, res) => {
  if (!prisma) {
    return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?error=Database not available`);
  }

  try {
    const { code } = req.query;
    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?error=No authorization code`);
    }

    // Exchange code for tokens with retry
    const tokenResponse = await withRetry(
      () => axios.post('https://api.hubapi.com/oauth/v1/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: process.env.HUBSPOT_CLIENT_ID,
          client_secret: process.env.HUBSPOT_CLIENT_SECRET,
          redirect_uri: process.env.HUBSPOT_REDIRECT_URI || `${process.env.FRONTEND_URL}/auth/callback`,
          code,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      ),
      { maxAttempts: 3, onRetry: (attempt) => console.log(`Token exchange retry ${attempt}`) }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Get portal info with retry
    const portalResponse = await withRetry(
      () => axios.get('https://api.hubapi.com/account-info/v3/details', {
        headers: { Authorization: `Bearer ${access_token}` },
      }),
      { maxAttempts: 3 }
    );

    const portalId = String(portalResponse.data.portalId);
    const portalName = portalResponse.data.accountName || `Portal ${portalId}`;
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    // Create or update user
    const user = await prisma.user.upsert({
      where: { hubspotPortalId: portalId },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt,
        portalName,
        updatedAt: new Date(),
      },
      create: {
        hubspotPortalId: portalId,
        portalName,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt,
        scopes: 'oauth,contacts,tickets,timeline',
      },
    });

    const token = generateToken(user.id);

    // Create sync job and auto-sync contacts after OAuth
    const syncJob = await prisma.syncJob.create({
      data: { userId: user.id, type: 'contact_sync', status: 'running', startedAt: new Date() },
    });
    syncContactsInBackground(user.id, user.id, syncJob.id);

    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}&portalName=${encodeURIComponent(portalName)}`);
  } catch (error) {
    console.error('OAuth callback error:', error.message);
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?error=${encodeURIComponent(error.message)}`);
  }
});

// Connect HubSpot with PAT token (requires authentication)
app.post('/api/auth/connect-hubspot', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }

  try {
    const { patToken } = req.body;

    if (!patToken) {
      return res.status(400).json({ success: false, error: { message: 'PAT token is required' } });
    }

    // Test the PAT token with retry
    const response = await withRetry(
      () => axios.get('https://api.hubapi.com/account-info/v3/details', {
        headers: { Authorization: `Bearer ${patToken}` },
      }),
      { maxAttempts: 3 }
    );

    const portalId = String(response.data.portalId);
    const portalName = response.data.accountName || `Portal ${portalId}`;

    // Update the logged-in user with HubSpot credentials
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        hubspotPortalId: portalId,
        portalName,
        accessToken: patToken,
        refreshToken: 'pat-refresh',
        tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        scopes: 'contacts,tickets,timeline',
      },
    });

    // Create sync job and auto-sync contacts
    const syncJob = await prisma.syncJob.create({
      data: { userId: user.id, type: 'contact_sync', status: 'running', startedAt: new Date() },
    });
    syncContactsInBackground(user.id, user.id, syncJob.id);

    res.json({
      success: true,
      data: {
        portalName,
        portalId,
        message: 'HubSpot connected successfully',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Check connection status
app.get('/api/auth/status', authenticate, async (req, res) => {
  if (!prisma) {
    return res.json({ success: true, data: { connected: false } });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.json({ success: true, data: { connected: false } });

    // Check if token is still valid
    const now = new Date();
    const tokenExpiry = new Date(user.tokenExpiresAt);
    const isValid = tokenExpiry > now || user.refreshToken === 'pat-refresh';

    res.json({
      success: true,
      data: {
        connected: true,
        portalName: user.portalName,
        portalId: user.hubspotPortalId,
        tokenValid: isValid,
        tokenExpiresAt: user.tokenExpiresAt,
      },
    });
  } catch (error) {
    res.json({ success: true, data: { connected: false } });
  }
});

// Disconnect
app.post('/api/auth/disconnect', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }
  try {
    await prisma.user.delete({ where: { id: req.userId } });
    res.json({ success: true, data: { message: 'Disconnected' } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// ==================== CONTACT ROUTES ====================

// Background contact sync with cursor-based pagination and retry
async function syncContactsInBackground(userId, requestingUserId, syncJobId) {
  if (!prisma) return;

  try {
    // Get valid access token (refresh if needed)
    const accessToken = await refreshHubspotToken(userId);

    // Get total count from HubSpot with rate limiting
    await hubspotRateLimiter.waitIfNeeded();
    const countResponse = await withRetry(
      () => axios.get('https://api.hubapi.com/crm/v3/objects/contacts', {
        params: { limit: 1, properties: 'email' },
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      { maxAttempts: 3, onRetry: (attempt) => console.log(`Count fetch retry ${attempt}`) }
    );
    const totalContacts = countResponse.data.total || 0;

    // Update job with total count
    await prisma.syncJob.update({
      where: { id: syncJobId },
      data: { totalItems: totalContacts },
    });

    let processed = 0, failed = 0;
    let after = undefined; // cursor for pagination
    let hasMore = true;

    // Cursor-based pagination loop
    while (hasMore) {
      // Rate limit before each request
      await hubspotRateLimiter.waitIfNeeded();

      // Fetch contacts batch with retry
      const response = await withRetry(
        () => axios.get('https://api.hubapi.com/crm/v3/objects/contacts', {
          params: {
            limit: 100,
            after: after,
            properties: 'email,firstname,lastname,phone,company,jobtitle,lifecyclestage,city,country',
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        {
          maxAttempts: 3,
          onRetry: (attempt) => console.log(`Contact fetch retry ${attempt}, cursor: ${after}`),
        }
      );

      const contacts = response.data.results || [];

      // Batch process contacts using Promise.all for parallel upserts
      const upsertPromises = contacts.map(async (contact) => {
        try {
          await prisma.contact.upsert({
            where: { hubspotId: contact.id },
            update: {
              email: contact.properties.email || null,
              firstName: contact.properties.firstname || null,
              lastName: contact.properties.lastname || null,
              phone: contact.properties.phone || null,
              company: contact.properties.company || null,
              jobTitle: contact.properties.jobtitle || null,
              lifecycleStage: contact.properties.lifecyclestage || null,
              city: contact.properties.city || null,
              country: contact.properties.country || null,
              hsCreatedAt: contact.createdAt ? new Date(contact.createdAt) : null,
              hsUpdatedAt: contact.updatedAt ? new Date(contact.updatedAt) : null,
              lastSyncedAt: new Date(),
            },
            create: {
              hubspotId: contact.id,
              userId,
              email: contact.properties.email || null,
              firstName: contact.properties.firstname || null,
              lastName: contact.properties.lastname || null,
              phone: contact.properties.phone || null,
              company: contact.properties.company || null,
              jobTitle: contact.properties.jobtitle || null,
              lifecycleStage: contact.properties.lifecyclestage || null,
              city: contact.properties.city || null,
              country: contact.properties.country || null,
              hsCreatedAt: contact.createdAt ? new Date(contact.createdAt) : null,
              hsUpdatedAt: contact.updatedAt ? new Date(contact.updatedAt) : null,
              lastSyncedAt: new Date(),
            },
          });
          return { success: true };
        } catch (err) {
          console.error(`Failed to sync contact ${contact.id}:`, err.message);
          return { success: false };
        }
      });

      // Wait for all upserts to complete in parallel
      const results = await Promise.all(upsertPromises);
      processed += results.filter(r => r.success).length;
      failed += results.filter(r => !r.success).length;

      // Update progress in real-time
      await prisma.syncJob.update({
        where: { id: syncJobId },
        data: {
          processed,
          failed,
          cursor: response.data.paging?.next?.after || null,
        },
      });

      // Check if there are more pages
      if (response.data.paging?.next?.after) {
        after = response.data.paging.next.after;
      } else {
        hasMore = false;
      }

      console.log(`Sync progress: ${processed}/${totalContacts} processed, ${failed} failed`);
    }

    // Mark job as completed
    await prisma.syncJob.update({
      where: { id: syncJobId },
      data: {
        status: failed > 0 ? 'completed_with_errors' : 'completed',
        processed,
        failed,
        completedAt: new Date(),
      },
    });

    console.log(`Contact sync completed: ${processed} processed, ${failed} failed`);
  } catch (error) {
    console.error('Contact sync failed:', error.message);
    // Mark job as failed
    await prisma.syncJob.update({
      where: { id: syncJobId },
      data: {
        status: 'failed',
        error: error.message,
        completedAt: new Date(),
      },
    }).catch(() => {});
  }
}

// Trigger contact sync (with rate limiting)
app.post('/api/contacts/sync', authenticate, syncLimiter, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ success: false, error: { message: 'User not found' } });

    // Create sync job first
    const syncJob = await prisma.syncJob.create({
      data: { userId: user.id, type: 'contact_sync', status: 'running', startedAt: new Date() },
    });

    // Pass the job ID to the background function
    syncContactsInBackground(user.id, user.id, syncJob.id);

    res.json({ success: true, data: { message: 'Contact sync started', jobId: syncJob.id } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Get contacts
app.get('/api/contacts', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search;
    const skip = (page - 1) * limit;

    const where = { userId: req.userId };
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { notes: true } } },
      }),
      prisma.contact.count({ where }),
    ]);

    res.json({
      success: true,
      data: { data: contacts, total, page, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Get contact by ID
app.get('/api/contacts/:id', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { notes: { orderBy: { createdAt: 'desc' } } },
    });

    if (!contact) return res.status(404).json({ success: false, error: { message: 'Contact not found' } });
    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Get sync jobs
app.get('/api/contacts/sync/jobs', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }
  try {
    const jobs = await prisma.syncJob.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, data: jobs });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Get sync job status
app.get('/api/contacts/sync/jobs/:jobId', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }
  try {
    const job = await prisma.syncJob.findFirst({
      where: { id: req.params.jobId, userId: req.userId },
    });
    if (!job) return res.status(404).json({ success: false, error: { message: 'Job not found' } });
    res.json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// ==================== NOTE ROUTES ====================

// Create note
app.post('/api/contacts/:contactId/notes', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }
  try {
    const { body } = req.body;
    if (!body) return res.status(400).json({ success: false, error: { message: 'Note body required' } });

    const contact = await prisma.contact.findFirst({
      where: { id: req.params.contactId, userId: req.userId },
    });
    if (!contact) return res.status(404).json({ success: false, error: { message: 'Contact not found' } });

    const note = await prisma.note.create({ data: { contactId: contact.id, body } });

    // Sync to HubSpot in background with automatic retry
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (user) {
      syncNoteToHubspotWithRetry(note.id, contact.hubspotId, body, user.id);
    }

    res.json({ success: true, data: note });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Background note sync with automatic retry
async function syncNoteToHubspotWithRetry(noteId, contactHubspotId, body, userId) {
  if (!prisma) return;

  const MAX_RETRIES = 5;
  let attempts = 0;

  while (attempts < MAX_RETRIES) {
    try {
      // Get fresh token (refresh if needed)
      const accessToken = await refreshHubspotToken(userId);

      // Rate limit
      await hubspotRateLimiter.waitIfNeeded();

      // Create engagement with retry
      const response = await withRetry(
        () => axios.post(
          'https://api.hubapi.com/engagements/v1/engagements',
          {
            engagement: { type: 'NOTE', timestamp: Date.now() },
            associations: { contactIds: [parseInt(contactHubspotId, 10)] },
            metadata: { body },
          },
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
        { maxAttempts: 3 }
      );

      // Success - update note
      await prisma.note.update({
        where: { id: noteId },
        data: {
          hubspotEngagementId: String(response.data.engagement.id),
          syncedToHubspot: true,
          syncAttempts: attempts + 1,
          lastSyncAttempt: new Date(),
          lastSyncError: null,
        },
      });

      console.log(`Note ${noteId} synced to HubSpot (attempt ${attempts + 1})`);
      return; // Success, exit
    } catch (error) {
      attempts++;
      console.error(`Note sync attempt ${attempts}/${MAX_RETRIES} failed for ${noteId}:`, error.message);

      // Update attempt count and error
      await prisma.note.update({
        where: { id: noteId },
        data: {
          syncAttempts: attempts,
          lastSyncError: error.message,
          lastSyncAttempt: new Date(),
        },
      });

      if (attempts < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const backoff = Math.min(1000 * Math.pow(2, attempts - 1), 16000);
        console.log(`Retrying note sync in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }

  console.error(`Note ${noteId} sync failed after ${MAX_RETRIES} attempts`);
}

// Get notes for contact
app.get('/api/contacts/:contactId/notes', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const contact = await prisma.contact.findFirst({
      where: { id: req.params.contactId, userId: req.userId },
    });
    if (!contact) return res.status(404).json({ success: false, error: { message: 'Contact not found' } });

    const [notes, total] = await Promise.all([
      prisma.note.findMany({ where: { contactId: contact.id }, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.note.count({ where: { contactId: contact.id } }),
    ]);

    res.json({ success: true, data: { data: notes, total, page, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Delete note
app.delete('/api/notes/:noteId', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }
  try {
    const note = await prisma.note.findUnique({
      where: { id: req.params.noteId },
      include: { contact: true },
    });
    if (!note || note.contact.userId !== req.userId) {
      return res.status(404).json({ success: false, error: { message: 'Note not found' } });
    }
    await prisma.note.delete({ where: { id: req.params.noteId } });
    res.json({ success: true, data: { message: 'Note deleted' } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Note sync status
app.get('/api/notes/sync-status', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }
  try {
    const [total, synced, pending, failed] = await Promise.all([
      prisma.note.count({ where: { contact: { userId: req.userId } } }),
      prisma.note.count({ where: { contact: { userId: req.userId }, syncedToHubspot: true } }),
      prisma.note.count({ where: { contact: { userId: req.userId }, syncedToHubspot: false, syncAttempts: { lt: 5 } } }),
      prisma.note.count({ where: { contact: { userId: req.userId }, syncedToHubspot: false, syncAttempts: { gte: 5 } } }),
    ]);
    res.json({ success: true, data: { total, synced, pending, failed } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Retry failed note syncs
app.post('/api/notes/retry-sync', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }
  try {
    const failedNotes = await prisma.note.findMany({
      where: { contact: { userId: req.userId }, syncedToHubspot: false, syncAttempts: { gte: 1 } },
      include: { contact: true },
    });

    let retried = 0, successful = 0, failed = 0;
    for (const note of failedNotes) {
      retried++;
      try {
        await syncNoteToHubspotWithRetry(note.id, note.contact.hubspotId, note.body, req.userId);
        successful++;
      } catch (err) {
        failed++;
      }
    }

    res.json({ success: true, data: { total: failedNotes.length, retried, successful, failed } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: { message: `Route ${req.method} ${req.path} not found` } });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ success: false, error: { message: err.message || 'Internal server error' } });
});

// Export for Vercel
module.exports = app;
