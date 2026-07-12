# HubSpot Sync - Contact Management Integration

A full-stack application that integrates with HubSpot using OAuth, automatically synchronizes contacts, and keeps notes synchronized between the application and HubSpot.

## 🌐 Live Demo

- **Frontend**: https://hubspot-sync-frontend.vercel.app
- **Backend**: https://hubspot-sync-backend.vercel.app
- **GitHub**: https://github.com/Yashvar2004/assignment

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Technology Choices](#technology-choices)
- [Features Implemented](#features-implemented)
- [Setup Instructions](#setup-instructions)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Scalability Design](#scalability-design)
- [Assumptions](#assumptions)
- [Limitations](#limitations)
- [Future Improvements](#future-improvements)

## 🎯 Project Overview

This application provides a production-ready integration with HubSpot's CRM platform:

- **OAuth 2.0 Integration** — Secure connection with automatic token refresh
- **Automatic Contact Synchronization** — Starts immediately after connection, no manual trigger
- **Bidirectional Note Sync** — Notes created in the app sync to HubSpot automatically
- **Scalable Architecture** — Rate limiting, retry with backoff, cursor-based pagination

## 🏗️ Architecture

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
│       │              │              │                           │
│       ▼              ▼              ▼                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Database (Prisma)                     │   │
│  │                    PostgreSQL (Neon)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      HubSpot API                                │
│  OAuth 2.0 │ CRM Contacts │ Engagements (Notes)                │
└─────────────────────────────────────────────────────────────────┘
```

### Design Decisions

1. **Express.js over NestJS/Fastify**: Chosen for simplicity and rapid development. Express is the most widely used Node.js framework with extensive middleware ecosystem.

2. **Prisma ORM**: Provides type-safe database queries, automatic migrations, and excellent developer experience. Supports PostgreSQL for production.

3. **PostgreSQL (Neon)**: Chosen for ACID compliance, scalability, and serverless-friendly hosting. Neon provides a free tier with connection pooling.

4. **In-process background jobs**: For this assignment scope, sync jobs run in the same process. The architecture supports extraction to separate workers for horizontal scaling.

5. **Rate limiting**: Implemented at two levels — Express middleware for API protection and token bucket for HubSpot API compliance.

## 💻 Technology Choices

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
| React Hot Toast | 2.x | Notifications |

## ✅ Features Implemented

### 1. HubSpot OAuth Integration

| Requirement | Implementation |
|-------------|----------------|
| Display "Connect HubSpot" button | ✅ ConnectButton component |
| Complete full OAuth flow | ✅ OAuth code exchange, token storage |
| Store tokens securely | ✅ PostgreSQL with encrypted storage |
| Handle token refresh automatically | ✅ `refreshHubspotToken()` — refreshes 5 min before expiry |

**OAuth Flow:**
1. User clicks "Connect HubSpot Account"
2. Frontend requests OAuth URL from backend
3. User authorizes in HubSpot
4. Backend exchanges code for tokens
5. Tokens stored in database with expiry
6. Automatic refresh before expiry (5-minute buffer)

### 2. Automatic Contact Synchronization

| Requirement | Implementation |
|-------------|----------------|
| Auto-start after connection | ✅ `syncContactsInBackground()` called on connect |
| No manual "Sync Contacts" button | ✅ Removed from UI — sync is fully automatic |
| Fetch contacts from HubSpot | ✅ HubSpot CRM API with pagination |
| Display in UI | ✅ ContactList component with table |
| Resumable if interrupted | ✅ Cursor-based pagination with SyncJob tracking |
| Avoid duplicates | ✅ Prisma upsert with `hubspotId` unique constraint |
| Handle failures/retries | ✅ `withRetry()` — 5 attempts, exponential backoff |

**Sync Flow:**
1. User connects HubSpot (OAuth or PAT)
2. SyncJob created in database
3. Background function fetches contacts with cursor pagination
4. Each contact upserted (insert or update)
5. Progress tracked in SyncJob
6. Job marked completed when done

### 3. Contact Notes

| Requirement | Implementation |
|-------------|----------------|
| Add notes from app | ✅ ContactDetail component with form |
| Store in database | ✅ Note model in PostgreSQL |
| Sync to HubSpot | ✅ Creates engagement via HubSpot API |
| Reliable with recovery | ✅ Automatic retry (5 attempts, exponential backoff) |

**Note Sync Flow:**
1. User adds note in app
2. Note saved to database (`syncedToHubspot: false`)
3. Background function creates HubSpot engagement
4. On success: updates `hubspotEngagementId` and `syncedToHubspot: true`
5. On failure: increments `syncAttempts`, stores error, retries automatically

### 4. User Interface

| Component | Status |
|-----------|--------|
| Connection status | ✅ Green badge in header |
| Connect HubSpot button | ✅ ConnectButton on landing page |
| Contact list | ✅ Table with search and pagination |
| Contact details | ✅ Full info with notes |
| Notes section | ✅ Add/delete notes with sync status |
| Loading states | ✅ Spinners and loading messages |
| Error states | ✅ Error messages with retry options |

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database (Neon recommended)
- HubSpot Developer Account

### 1. Clone the Repository
```bash
git clone https://github.com/Yashvar2004/assignment.git
cd assignment
```

### 2. Backend Setup
```bash
cd backend

# Install dependencies
npm install

# Create .env file (see Environment Variables section)
cp .env.example .env
# Edit .env with your credentials

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Start development server
npm run dev
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### 4. Open Application
Navigate to `http://localhost:5173`

## 🔧 Environment Variables

### Backend (Required)
```env
# Database (Required)
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"

# JWT Secret (Required - no fallback, server fails without it)
JWT_SECRET="your-secure-random-string-min-32-chars"

# HubSpot OAuth (Required for OAuth flow)
HUBSPOT_CLIENT_ID="your-client-id"
HUBSPOT_CLIENT_SECRET="your-client-secret"
HUBSPOT_REDIRECT_URI="http://localhost:3001/api/auth/hubspot/callback"

# HubSpot PAT Token (Optional - for development/testing)
HUBSPOT_PAT_TOKEN="pat-na2-..."

# Frontend URL (Required for OAuth redirect)
FRONTEND_URL="http://localhost:5173"

# Environment
NODE_ENV="development"
```

### Frontend
No environment variables required — API calls go through Vercel rewrites to backend.

## 💻 Local Development

### Running the Application

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
# Server runs on http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# App runs on http://localhost:5173
```

### Testing the Application

1. Open `http://localhost:5173`
2. Click "Connect HubSpot Account"
3. Complete OAuth flow (or use PAT token)
4. Contacts sync automatically
5. Click a contact to view details
6. Add notes — they sync to HubSpot automatically

## 🚢 Deployment

### Frontend (Vercel)
1. Push code to GitHub
2. Connect repository to Vercel
3. Set Root Directory to `frontend`
4. Deploy — Vercel auto-detects Vite

### Backend (Vercel)
1. Create new Vercel project
2. Set Root Directory to `backend`
3. Add environment variables (see above)
4. Deploy

### Database (Neon)
1. Create account at https://neon.tech
2. Create new project
3. Copy connection string to `DATABASE_URL`

## 📚 API Documentation

### Authentication
| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| GET | `/api/auth/hubspot` | Get OAuth URL | 100/15min |
| GET | `/api/auth/hubspot/callback` | OAuth callback | 100/15min |
| POST | `/api/auth/connect-pat` | Connect with PAT | 100/15min |
| GET | `/api/auth/status` | Connection status | 100/15min |
| POST | `/api/auth/disconnect` | Disconnect | 100/15min |

### Contacts
| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| GET | `/api/contacts` | List contacts (paginated) | 100/15min |
| GET | `/api/contacts/:id` | Get contact details | 100/15min |
| GET | `/api/contacts/sync/jobs` | Get sync jobs | 100/15min |
| GET | `/api/contacts/sync/jobs/:jobId` | Get job status | 100/15min |

### Notes
| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| POST | `/api/contacts/:contactId/notes` | Create note | 100/15min |
| GET | `/api/contacts/:contactId/notes` | Get notes | 100/15min |
| DELETE | `/api/notes/:noteId` | Delete note | 100/15min |
| GET | `/api/notes/sync-status` | Note sync status | 100/15min |
| POST | `/api/notes/retry-sync` | Retry failed syncs | 100/15min |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

## 📈 Scalability Design

### Current Implementation

| Feature | Implementation | Production Ready |
|---------|---------------|------------------|
| Rate Limiting | express-rate-limit (100 req/15min) | ✅ |
| HubSpot Rate Limiting | Token bucket (100 req/10s) | ✅ |
| Retry | Exponential backoff (5 attempts) | ✅ |
| Idempotent Operations | Upsert with unique constraints | ✅ |
| Cursor-based Pagination | Resumable syncs | ✅ |
| Token Refresh | Auto-refresh 5 min before expiry | ✅ |

### Scaling to 100K Contacts/Minute

The current architecture supports scaling through:

1. **Queue-based Processing**: Extract sync jobs to BullMQ + Redis
2. **Multiple Workers**: Deploy worker processes across servers
3. **Batch Processing**: Process contacts in configurable batches
4. **Parallelism**: Process multiple batches concurrently
5. **Database Optimization**: Connection pooling, batch inserts

### Production Recommendations

| Component | Current | Production |
|-----------|---------|------------|
| Background Jobs | In-process | BullMQ + Redis workers |
| Database | Neon PostgreSQL | Neon with read replicas |
| Rate Limiting | In-memory | Redis-backed |
| Monitoring | Console logs | Winston + Datadog |
| Caching | None | Redis cache |

## 🤔 Assumptions

1. **Single Portal**: One HubSpot portal per user account
2. **PostgreSQL**: Production database with connection pooling
3. **HubSpot API Limits**: 100 requests per 10 seconds per portal
4. **Token Refresh**: 5-minute buffer before expiry
5. **Batch Size**: 100 contacts per API call (HubSpot maximum)
6. **Retry Strategy**: 5 attempts with exponential backoff (1s, 2s, 4s, 8s, 16s)

## ⚠️ Limitations

1. **In-process Background Jobs**: Sync jobs run in the same process as the API server. If the server restarts, running jobs are lost. The SyncJob table tracks state for manual recovery.

2. **No Webhook Support**: Uses polling instead of real-time webhooks from HubSpot. Changes in HubSpot are not immediately reflected.

3. **Single Worker**: No horizontal scaling for background jobs. Multiple sync requests are processed sequentially.

4. **PAT Token Fallback**: PAT tokens don't expire and don't support refresh. OAuth flow is the production-ready approach.

## 🚀 Future Improvements

1. **BullMQ + Redis**: Extract background jobs to dedicated workers for horizontal scaling
2. **Webhook Support**: Real-time updates from HubSpot
3. **Incremental Sync**: Only sync changed contacts using `lastmodifieddate`
4. **Multi-Portal Support**: Connect multiple HubSpot accounts
5. **Monitoring**: Structured logging with Winston, metrics with Prometheus
6. **Testing**: Unit tests, integration tests, E2E tests
7. **Docker**: Containerized deployment
8. **CI/CD**: GitHub Actions for automated testing and deployment

## 📝 License

This project is created for technical assessment purposes.
