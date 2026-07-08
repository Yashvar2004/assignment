const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');

let prisma = null;

// Try to initialize Prisma
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
  console.log('Prisma initialized successfully');
} catch (err) {
  console.error('Prisma initialization failed:', err.message);
}

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://frontend-nine-bay-26.vercel.app',
    /\.vercel\.app$/,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const JWT_SECRET = process.env.JWT_SECRET || 'hubspot-sync-jwt-secret-2026';

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

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

// Test endpoint (no Prisma needed)
app.get('/test', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend is working',
    timestamp: new Date().toISOString(),
    prisma: prisma ? 'connected' : 'not connected',
    env: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'not set',
      HUBSPOT_PAT_TOKEN: process.env.HUBSPOT_PAT_TOKEN ? 'set' : 'not set',
    },
  });
});

// Health check
app.get('/health', async (req, res) => {
  if (!prisma) {
    return res.status(503).json({
      success: false,
      error: { status: 'unhealthy', message: 'Prisma not initialized' },
    });
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: 'connected',
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: { status: 'unhealthy', message: error.message },
    });
  }
});

// Connect with PAT token
app.post('/api/auth/connect-pat', async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }

  try {
    const patToken = process.env.HUBSPOT_PAT_TOKEN;
    if (!patToken) {
      return res.status(400).json({ success: false, error: { message: 'No PAT token configured' } });
    }

    const response = await axios.get('https://api.hubapi.com/account-info/v3/details', {
      headers: { Authorization: `Bearer ${patToken}` },
    });

    const portalId = String(response.data.portalId);
    const portalName = response.data.accountName || `Portal ${portalId}`;

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

    const token = generateToken(user.id);

    // Auto-sync contacts
    syncContactsInBackground(user.id, patToken);

    res.json({
      success: true,
      data: { token, portalName, portalId, message: 'Connected to HubSpot' },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Get OAuth URL
app.get('/api/auth/hubspot', (req, res) => {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientId) {
    return res.status(400).json({ success: false, error: { message: 'OAuth not configured' } });
  }
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI || `${process.env.FRONTEND_URL}/auth/callback`;
  const scopes = ['oauth', 'contacts', 'tickets', 'timeline'].join(' ');
  const url = `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code`;
  res.json({ success: true, data: { url } });
});

// OAuth callback
app.get('/api/auth/hubspot/callback', async (req, res) => {
  if (!prisma) {
    return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?error=Database not available`);
  }

  try {
    const { code } = req.query;
    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?error=No authorization code`);
    }

    const tokenResponse = await axios.post('https://api.hubapi.com/oauth/v1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        redirect_uri: process.env.HUBSPOT_REDIRECT_URI || `${process.env.FRONTEND_URL}/auth/callback`,
        code,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const portalResponse = await axios.get('https://api.hubapi.com/account-info/v3/details', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const portalId = String(portalResponse.data.portalId);
    const portalName = portalResponse.data.accountName || `Portal ${portalId}`;

    const user = await prisma.user.upsert({
      where: { hubspotPortalId: portalId },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        portalName,
        updatedAt: new Date(),
      },
      create: {
        hubspotPortalId: portalId,
        portalName,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        scopes: 'oauth,contacts,tickets,timeline',
      },
    });

    const token = generateToken(user.id);
    syncContactsInBackground(user.id, access_token);

    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}&portalName=${encodeURIComponent(portalName)}`);
  } catch (error) {
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?error=${encodeURIComponent(error.message)}`);
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
    res.json({
      success: true,
      data: { connected: true, portalName: user.portalName, portalId: user.hubspotPortalId },
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

// Background sync
async function syncContactsInBackground(userId, accessToken) {
  if (!prisma) return;
  try {
    const syncJob = await prisma.syncJob.create({
      data: { userId, type: 'contact_sync', status: 'running', startedAt: new Date() },
    });

    const response = await axios.get('https://api.hubapi.com/crm/v3/objects/contacts', {
      params: {
        limit: 100,
        properties: 'email,firstname,lastname,phone,company,jobtitle,lifecyclestage,city,country',
      },
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const contacts = response.data.results || [];
    let processed = 0, failed = 0;

    for (const contact of contacts) {
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
        processed++;
      } catch (err) {
        failed++;
      }
    }

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: failed > 0 ? 'completed_with_errors' : 'completed',
        totalItems: contacts.length,
        processed,
        failed,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Contact sync failed:', error.message);
  }
}

// Sync contacts
app.post('/api/contacts/sync', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ success: false, error: { message: 'User not found' } });

    const syncJob = await prisma.syncJob.create({
      data: { userId: user.id, type: 'contact_sync', status: 'running', startedAt: new Date() },
    });

    syncContactsInBackground(user.id, user.accessToken);

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

    // Sync to HubSpot
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (user) {
      syncNoteToHubspot(note.id, contact.hubspotId, body, user.accessToken);
    }

    res.json({ success: true, data: note });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

async function syncNoteToHubspot(noteId, contactHubspotId, body, accessToken) {
  if (!prisma) return;
  try {
    const response = await axios.post(
      'https://api.hubapi.com/engagements/v1/engagements',
      {
        engagement: { type: 'NOTE', timestamp: Date.now() },
        associations: { contactIds: [parseInt(contactHubspotId, 10)] },
        metadata: { body },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    await prisma.note.update({
      where: { id: noteId },
      data: { hubspotEngagementId: String(response.data.engagement.id), syncedToHubspot: true },
    });
  } catch (error) {
    await prisma.note.update({
      where: { id: noteId },
      data: {
        syncAttempts: { increment: 1 },
        lastSyncError: error.message,
        lastSyncAttempt: new Date(),
      },
    });
  }
}

// Get notes
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

// Retry failed syncs
app.post('/api/notes/retry-sync', authenticate, async (req, res) => {
  if (!prisma) {
    return res.status(503).json({ success: false, error: { message: 'Database not available' } });
  }
  try {
    const failedNotes = await prisma.note.findMany({
      where: { contact: { userId: req.userId }, syncedToHubspot: false, syncAttempts: { gte: 1 } },
      include: { contact: true },
    });

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ success: false, error: { message: 'User not found' } });

    let retried = 0, successful = 0, failed = 0;
    for (const note of failedNotes) {
      retried++;
      try {
        await syncNoteToHubspot(note.id, note.contact.hubspotId, note.body, user.accessToken);
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: { message: `Route ${req.method} ${req.path} not found` } });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ success: false, error: { message: err.message || 'Internal server error' } });
});

module.exports = app;
