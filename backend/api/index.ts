import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';

// Initialize Prisma
const prisma = new PrismaClient();

const app = express();

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'https://frontend-nine-bay-26.vercel.app',
      /\.vercel\.app$/,
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', async (req, res) => {
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
  } catch (error: any) {
    res.status(503).json({
      success: false,
      error: { status: 'unhealthy', message: error.message },
    });
  }
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend is working',
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'not set',
      HUBSPOT_PAT_TOKEN: process.env.HUBSPOT_PAT_TOKEN ? 'set' : 'not set',
    },
  });
});

// Auth routes - PAT connect
app.post('/api/auth/connect-pat', async (req, res) => {
  try {
    const patToken = process.env.HUBSPOT_PAT_TOKEN;

    if (!patToken) {
      res.status(400).json({
        success: false,
        error: { message: 'No PAT token configured' },
      });
      return;
    }

    // Test the PAT token by getting portal info
    const axios = (await import('axios')).default;
    const response = await axios.get('https://api.hubapi.com/account-info/v3/details', {
      headers: { Authorization: `Bearer ${patToken}` },
    });

    const portalInfo = response.data;
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

    // Generate JWT
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      data: {
        token,
        portalName,
        portalId,
        message: 'Connected to HubSpot via Personal Access Token',
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { message: error.message },
    });
  }
});

// Auth status
app.get('/api/auth/status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.json({ success: true, data: { connected: false } });
      return;
    }

    const token = authHeader.split(' ')[1];
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      res.json({ success: true, data: { connected: false } });
      return;
    }

    res.json({
      success: true,
      data: {
        connected: true,
        portalName: user.portalName,
        portalId: user.hubspotPortalId,
      },
    });
  } catch (error) {
    res.json({ success: true, data: { connected: false } });
  }
});

// Get contacts
app.get('/api/contacts', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    const token = authHeader.split(' ')[1];
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const skip = (page - 1) * limit;

    const where: any = { userId: decoded.userId };
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
      data: {
        contacts,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Sync contacts
app.post('/api/contacts/sync', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    const token = authHeader.split(' ')[1];
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found' } });
      return;
    }

    // Create sync job
    const syncJob = await prisma.syncJob.create({
      data: {
        userId: user.id,
        type: 'contact_sync',
        status: 'running',
        startedAt: new Date(),
      },
    });

    // Fetch contacts from HubSpot
    const axios = (await import('axios')).default;
    const hubspotResponse = await axios.get('https://api.hubapi.com/crm/v3/objects/contacts', {
      params: {
        limit: 100,
        properties: 'email,firstname,lastname,phone,company,jobtitle,lifecyclestage,city,country',
      },
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });

    const contacts = hubspotResponse.data.results || [];
    let processed = 0;

    // Upsert each contact
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
            userId: user.id,
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
        console.error(`Failed to sync contact ${contact.id}`, err);
      }
    }

    // Update sync job
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'completed',
        totalItems: contacts.length,
        processed,
        completedAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        message: 'Contact sync completed',
        jobId: syncJob.id,
        totalContacts: contacts.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Get sync jobs
app.get('/api/contacts/sync/jobs', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    const token = authHeader.split(' ')[1];
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

    const jobs = await prisma.syncJob.findMany({
      where: { userId: decoded.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({ success: true, data: jobs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Get contact by ID
app.get('/api/contacts/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    const token = authHeader.split(' ')[1];
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

    const contact = await prisma.contact.findFirst({
      where: {
        id: req.params.id,
        userId: decoded.userId,
      },
      include: {
        notes: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!contact) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }

    res.json({ success: true, data: contact });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Create note
app.post('/api/contacts/:contactId/notes', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    const token = authHeader.split(' ')[1];
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

    const { body } = req.body;
    if (!body) {
      res.status(400).json({ success: false, error: { message: 'Note body is required' } });
      return;
    }

    const contact = await prisma.contact.findFirst({
      where: {
        id: req.params.contactId,
        userId: decoded.userId,
      },
    });

    if (!contact) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }

    const note = await prisma.note.create({
      data: {
        contactId: contact.id,
        body,
      },
    });

    // Try to sync to HubSpot in background
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (user) {
      const axios = (await import('axios')).default;
      axios
        .post(
          'https://api.hubapi.com/engagements/v1/engagements',
          {
            engagement: { type: 'NOTE', timestamp: Date.now() },
            associations: { contactIds: [parseInt(contact.hubspotId, 10)] },
            metadata: { body },
          },
          { headers: { Authorization: `Bearer ${user.accessToken}` } }
        )
        .then(async (response) => {
          await prisma.note.update({
            where: { id: note.id },
            data: {
              hubspotEngagementId: String(response.data.engagement.id),
              syncedToHubspot: true,
            },
          });
        })
        .catch((err) => {
          console.error('Failed to sync note to HubSpot:', err.message);
        });
    }

    res.json({ success: true, data: note });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Get notes for contact
app.get('/api/contacts/:contactId/notes', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    const token = authHeader.split(' ')[1];
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const contact = await prisma.contact.findFirst({
      where: {
        id: req.params.contactId,
        userId: decoded.userId,
      },
    });

    if (!contact) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where: { contactId: contact.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.note.count({ where: { contactId: contact.id } }),
    ]);

    res.json({
      success: true,
      data: {
        data: notes,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Delete note
app.delete('/api/notes/:noteId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    const token = authHeader.split(' ')[1];
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

    const note = await prisma.note.findUnique({
      where: { id: req.params.noteId },
      include: { contact: true },
    });

    if (!note || note.contact.userId !== decoded.userId) {
      res.status(404).json({ success: false, error: { message: 'Note not found' } });
      return;
    }

    await prisma.note.delete({ where: { id: req.params.noteId } });

    res.json({ success: true, data: { message: 'Note deleted' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Note sync status
app.get('/api/notes/sync-status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    const token = authHeader.split(' ')[1];
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

    const [total, synced, pending, failed] = await Promise.all([
      prisma.note.count({
        where: { contact: { userId: decoded.userId } },
      }),
      prisma.note.count({
        where: { contact: { userId: decoded.userId }, syncedToHubspot: true },
      }),
      prisma.note.count({
        where: { contact: { userId: decoded.userId }, syncedToHubspot: false, syncAttempts: { lt: 5 } },
      }),
      prisma.note.count({
        where: { contact: { userId: decoded.userId }, syncedToHubspot: false, syncAttempts: { gte: 5 } },
      }),
    ]);

    res.json({
      success: true,
      data: { total, synced, pending, failed },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { message: `Route ${req.method} ${req.path} not found` },
  });
});

// Error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err);
  res.status(err.statusCode || 500).json({
    success: false,
    error: { message: err.message || 'Internal server error' },
  });
});

export default app;
