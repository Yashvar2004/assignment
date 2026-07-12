# HubSpot Sync - Technical Submission Document

**Developer**: Yash vardhan Vats  
**Email**: yashvardhanvats06@gmail.com  
**Date**: July 12, 2026

---

## 1. Project Links

| Item | URL |
|------|-----|
| **GitHub Repository** | https://github.com/Yashvar2004/assignment |
| **Frontend (Vercel)** | https://hubspot-sync-frontend.vercel.app |
| **Backend (Vercel)** | https://hubspot-sync-backend.vercel.app |

---

## 2. How to Use the Deployed Application

### Step 1: Get Your HubSpot PAT Token

1. Go to **https://app.hubspot.com**
2. Click **Settings** (gear icon, top right corner)
3. In the left sidebar, go to **Integrations** → **Private Apps**
4. If you don't see "Private Apps", search for **"Legacy Apps"** in the settings search bar
5. Click **"Create a private app"**
6. Give it a name: `My HubSpot Sync App`
7. Go to the **Scopes** tab and add these scopes:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.objects.companies.read`
   - `crm.objects.deals.read`
   - `crm.objects.deals.write`
8. Click **"Create app"**
9. Copy the **Access Token** (starts with `pat-na2-...`)

### Step 2: Sign Up on the Deployed App

1. Open **https://hubspot-sync-frontend.vercel.app**
2. Click **"Don't have an account? Sign up"**
3. Enter your **email** and **password** (minimum 6 characters)
4. Click **"Create Account"**
5. You will see the **"Connect HubSpot"** page
6. Paste your **PAT token** (from Step 1) in the input field
7. Click **"Connect HubSpot"**
8. Wait **10-15 seconds** — your contacts will sync automatically

### Step 3: Use the App

- **View contacts**: Your HubSpot contacts appear automatically
- **Add notes**: Click on any contact, type a note, and click "Add Note"
- **Notes sync to HubSpot**: Notes you add in the app appear in HubSpot automatically
- **Auto-sync**: New contacts from HubSpot sync every 30 seconds
- **Refresh**: Click the "Refresh" button for instant sync

---

## 3. Project Overview

This application provides a production-ready integration with HubSpot's CRM platform:

- **User Authentication** — Register and login with email/password
- **HubSpot Integration** — Connect your HubSpot account using a PAT token
- **Automatic Contact Synchronization** — Contacts sync automatically after connection
- **Bidirectional Note Sync** — Notes created in the app sync to HubSpot
- **Auto-refresh** — Contacts sync every 30 seconds automatically
- **Multi-user Support** — Each user has their own contacts and data

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│                         Deployed on Vercel                      │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Express.js)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Auth    │  │ Contacts │  │  Notes   │  │ Rate Limiter │   │
│  │  Routes  │  │  Routes  │  │  Routes  │  │              │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────┘   │
│       │              │              │                           │
│       ▼              ▼              ▼                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Service Layer                         │   │
│  │  TokenRefresh │ RateLimiter │ RetryWithBackoff          │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                        │
│       ▼                                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Database (Prisma)                     │   │
│  │                    PostgreSQL (Neon)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      HubSpot API                                │
│  CRM Contacts │ Engagements (Notes)                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Technology Stack

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 22.x | Runtime environment |
| Express.js | 4.21.x | Web framework |
| Prisma | 6.9.x | ORM for database |
| PostgreSQL | 15.x | Database (Neon) |
| express-rate-limit | 7.5.x | API rate limiting |
| jsonwebtoken | 9.0.x | JWT authentication |
| axios | 1.7.x | HTTP client with retry |

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI framework |
| TypeScript | 5.7.x | Type safety |
| Vite | 6.x | Build tool |
| Tailwind CSS | 4.x | Styling |
| React Router | 6.x | Client-side routing |
| Axios | 1.7.x | HTTP client |

---

## 6. Database Schema

### User Table
```sql
CREATE TABLE User (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE,
  password        TEXT,
  name            TEXT,
  hubspotPortalId TEXT,
  portalName      TEXT,
  accessToken     TEXT,
  refreshToken    TEXT,
  tokenExpiresAt  TIMESTAMP,
  scopes          TEXT,
  createdAt       TIMESTAMP DEFAULT NOW(),
  updatedAt       TIMESTAMP
);
```

### Contact Table
```sql
CREATE TABLE Contact (
  id              TEXT PRIMARY KEY,
  hubspotId       TEXT,
  userId          TEXT REFERENCES User(id),
  email           TEXT,
  firstName       TEXT,
  lastName        TEXT,
  phone           TEXT,
  company         TEXT,
  jobTitle        TEXT,
  lifecycleStage  TEXT,
  city            TEXT,
  country         TEXT,
  hsCreatedAt     TIMESTAMP,
  hsUpdatedAt     TIMESTAMP,
  lastSyncedAt    TIMESTAMP DEFAULT NOW(),
  createdAt       TIMESTAMP DEFAULT NOW(),
  updatedAt       TIMESTAMP,
  UNIQUE(userId, hubspotId)
);
```

### Note Table
```sql
CREATE TABLE Note (
  id                   TEXT PRIMARY KEY,
  hubspotEngagementId  TEXT UNIQUE,
  contactId            TEXT REFERENCES Contact(id),
  body                 TEXT,
  syncedToHubspot      BOOLEAN DEFAULT FALSE,
  syncAttempts         INT DEFAULT 0,
  lastSyncError        TEXT,
  lastSyncAttempt      TIMESTAMP,
  createdAt            TIMESTAMP DEFAULT NOW(),
  updatedAt            TIMESTAMP
);
```

### SyncJob Table
```sql
CREATE TABLE SyncJob (
  id            TEXT PRIMARY KEY,
  userId        TEXT REFERENCES User(id),
  type          TEXT,
  status        TEXT DEFAULT 'pending',
  totalItems    INT,
  processed     INT DEFAULT 0,
  failed        INT DEFAULT 0,
  cursor        TEXT,
  startedAt     TIMESTAMP,
  completedAt   TIMESTAMP,
  error         TEXT,
  createdAt     TIMESTAMP DEFAULT NOW(),
  updatedAt     TIMESTAMP
);
```

---

## 7. API Documentation

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/connect-hubspot` | Connect HubSpot with PAT token |
| GET | `/api/auth/status` | Check connection status |
| POST | `/api/auth/disconnect` | Disconnect HubSpot |

### Contacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts` | List contacts (paginated, searchable) |
| GET | `/api/contacts/:id` | Get contact details |
| POST | `/api/contacts/sync` | Trigger contact sync |
| GET | `/api/contacts/sync/jobs` | Get sync jobs |
| GET | `/api/contacts/sync/jobs/:jobId` | Get sync job status |

### Notes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/contacts/:contactId/notes` | Create note |
| GET | `/api/contacts/:contactId/notes` | Get notes |
| DELETE | `/api/notes/:noteId` | Delete note |
| GET | `/api/notes/sync-status` | Note sync status |
| POST | `/api/notes/retry-sync` | Retry failed note syncs |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

---

## 8. Scalability Design

| Feature | Implementation |
|---------|---------------|
| **Rate Limiting** | express-rate-limit (100 req/15min) + HubSpot token bucket (100 req/10s) |
| **Retry** | Exponential backoff with jitter (5 attempts) |
| **Idempotent Operations** | Upsert with compound unique constraint |
| **Cursor-based Pagination** | Resumable syncs with cursor tracking |
| **Batch Processing** | Promise.all for parallel upserts |
| **Token Refresh** | Auto-refresh 5 minutes before expiry |

### Production Scaling Recommendations
1. **BullMQ + Redis**: Extract background jobs to dedicated workers
2. **Database Read Replicas**: Separate read and write databases
3. **Caching Layer**: Redis cache for frequently accessed data
4. **Multiple Worker Instances**: Deploy workers across servers

---

## 9. Limitations

1. **PAT Token Authentication**: Uses PAT token instead of full OAuth flow (HubSpot disabled public app creation)
2. **In-memory Rate Limiting**: Rate limits reset on serverless cold start
3. **No Queue System**: Background jobs run in-process
4. **Single HubSpot Account per User**: Each user connects one HubSpot account

---

## 10. Future Improvements

1. **BullMQ + Redis**: Extract background jobs to dedicated workers
2. **Full OAuth Flow**: Implement when HubSpot re-enables public app creation
3. **Webhook Support**: Real-time updates from HubSpot
4. **Incremental Sync**: Only sync changed contacts
5. **Docker Support**: Containerized deployment
6. **Unit Tests**: Comprehensive test coverage

---

## 11. Contact Information

**Developer**: Yash vardhan Vats  
**Email**: yashvardhanvats06@gmail.com  
**GitHub**: https://github.com/Yashvar2004

---

*Document created: July 12, 2026*
