# HubSpot Sync - Contact Management Integration

A production-ready full-stack application that integrates with HubSpot using OAuth, automatically synchronizes contacts, and keeps notes synchronized between the application and HubSpot.

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

This application demonstrates a scalable integration with HubSpot's CRM platform. It handles:

1. **OAuth 2.0 Authentication** - Secure connection to HubSpot accounts
2. **Automatic Contact Synchronization** - Background sync of contacts using queue-based processing
3. **Bidirectional Note Sync** - Notes created in the app sync back to HubSpot as engagements
4. **Production-Ready Architecture** - Designed to scale to 100,000+ contacts per minute

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
│  │  Auth    │  │ Contacts │  │  Notes   │  │   Health     │   │
│  │  Routes  │  │  Routes  │  │  Routes  │  │   Check      │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────┘   │
│       │              │              │                           │
│       ▼              ▼              ▼                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Service Layer                         │   │
│  │  OAuthService │ ContactService │ NoteService            │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │              │              │                           │
│       ▼              ▼              ▼                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │ Prisma   │  │  BullMQ  │  │  Redis   │                     │
│  │ (SQLite/ │  │ (Job     │  │ (Queue   │                     │
│  │ Postgres)│  │  Queue)  │  │  Store)  │                     │
│  └──────────┘  └──────────┘  └──────────┘                     │
│                      │                                          │
│                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Background Workers                          │   │
│  │  ContactSyncWorker │ NoteSyncWorker                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      HubSpot API                                │
│  OAuth 2.0 │ CRM Contacts │ Engagements (Notes)                │
└─────────────────────────────────────────────────────────────────┘
```

## 💻 Technology Choices

### Backend

| Technology | Choice | Rationale |
|------------|--------|-----------|
| Runtime | Node.js 22 | JavaScript everywhere, excellent async support |
| Framework | Express.js | Mature, well-documented, flexible |
| Language | TypeScript | Type safety, better DX, fewer runtime errors |
| ORM | Prisma | Type-safe queries, migrations, excellent DX |
| Database | SQLite (dev) / PostgreSQL (prod) | Easy local setup, production-ready |
| Queue | BullMQ | Redis-backed, reliable, supports retries |
| Logging | Winston | Structured logging, multiple transports |

### Frontend

| Technology | Choice | Rationale |
|------------|--------|-----------|
| Framework | React 18 | Component-based, huge ecosystem |
| Build Tool | Vite | Fast HMR, optimized builds |
| Language | TypeScript | Type safety shared with backend |
| Styling | Tailwind CSS | Utility-first, rapid development |
| Routing | React Router | Standard routing solution |
| HTTP Client | Axios | Interceptors, automatic retries |

## ✅ Features Implemented

### Core Features

- [x] **HubSpot OAuth 2.0 Integration**
  - Complete OAuth flow with authorization code exchange
  - Secure token storage in database
  - Automatic token refresh before expiry
  - Connection status checking

- [x] **Automatic Contact Synchronization**
  - Auto-triggered after OAuth connection
  - Cursor-based pagination for resumable syncs
  - Batch processing with configurable size
  - Idempotent upsert operations (no duplicates)
  - Progress tracking with SyncJob model
  - Error handling with retry logic

- [x] **Bidirectional Note Synchronization**
  - Create notes from the application
  - Automatic sync to HubSpot as engagements
  - Sync status tracking per note
  - Failed sync retry mechanism

- [x] **User Interface**
  - Connect HubSpot button
  - Connection status indicator
  - Contact list with search and pagination
  - Contact detail view with notes
  - Sync status dashboard
  - Loading, error, and success states

### Bonus Features

- [x] **Sync Status Dashboard** - Real-time sync progress monitoring
- [x] **Search and Filtering** - Search contacts by name, email, company
- [x] **Pagination** - Server-side pagination for contacts and notes
- [x] **Background Job Monitoring** - Track sync job progress
- [x] **Retry Dashboard** - View and retry failed operations
- [x] **Rate Limiting** - Respects HubSpot API limits
- [x] **Error Recovery** - Resumable syncs after failures
- [x] **Health Checks** - Database and Redis connection monitoring
- [x] **Docker Support** - Docker Compose for local development
- [x] **Structured Logging** - Winston with multiple transports

## 🚀 Setup Instructions

### Prerequisites

- Node.js 18+ and npm
- Redis (for job queue)
- HubSpot Developer Account

### 1. Clone the Repository

```bash
git clone <repository-url>
cd hubspot-sync
```

### 2. Set Up HubSpot App

1. Go to [HubSpot Developer Portal](https://developers.hubspot.com/)
2. Create a new app
3. Configure OAuth settings:
   - Redirect URL: `http://localhost:3001/api/auth/hubspot/callback`
   - Scopes: `oauth`, `contacts`, `tickets`, `timeline`
4. Note your Client ID and Client Secret

### 3. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your credentials
# HUBSPOT_CLIENT_ID=your_client_id
# HUBSPOT_CLIENT_SECRET=your_client_secret

# Set up database
npx prisma generate
npx prisma db push

# Start development server
npm run dev
```

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### 5. Using Docker (Alternative)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 🔧 Environment Variables

### Backend (.env)

```env
# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Database
DATABASE_URL="file:./dev.db"  # SQLite for development
# DATABASE_URL="postgresql://user:password@localhost:5432/hubspot_sync"  # PostgreSQL for production

# Redis
REDIS_URL=redis://localhost:6379

# HubSpot OAuth
HUBSPOT_CLIENT_ID=your_client_id
HUBSPOT_CLIENT_SECRET=your_client_secret
HUBSPOT_REDIRECT_URI=http://localhost:3001/api/auth/hubspot/callback

# JWT
JWT_SECRET=your_secure_jwt_secret
```

### Frontend (.env)

```env
VITE_API_URL=http://localhost:3001
```

## 💻 Local Development

### Running the Application

1. **Start Redis** (required for job queue):
   ```bash
   redis-server
   # Or using Docker:
   docker run -d -p 6379:6379 redis:alpine
   ```

2. **Start Backend**:
   ```bash
   cd backend
   npm run dev
   # Server runs on http://localhost:3001
   ```

3. **Start Frontend**:
   ```bash
   cd frontend
   npm run dev
   # App runs on http://localhost:5173
   ```

4. **Start Workers** (optional, for background processing):
   ```bash
   cd backend
   npm run worker:contacts
   npm run worker:notes
   ```

### Development Tools

- **Prisma Studio**: `npx prisma studio` - Visual database editor
- **API Testing**: Use the health endpoint at `GET /health`
- **Logs**: Check `backend/logs/` for application logs

## 🚢 Deployment

### Frontend (Vercel)

1. Push code to GitHub
2. Connect repository to Vercel
3. Configure environment variables:
   - `VITE_API_URL` = Your backend URL
4. Deploy

### Backend (Render/Railway/Any Node.js hosting)

1. Set environment variables in your hosting platform
2. Use PostgreSQL instead of SQLite for production
3. Ensure Redis is accessible
4. Deploy with `npm start`

### Database (Production)

For production, switch to PostgreSQL:

1. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

## 📚 API Documentation

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/hubspot` | Get OAuth authorization URL |
| GET | `/api/auth/hubspot/callback` | OAuth callback handler |
| GET | `/api/auth/status` | Check connection status |
| POST | `/api/auth/disconnect` | Disconnect HubSpot account |

### Contacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/contacts/sync` | Trigger contact sync |
| GET | `/api/contacts` | List contacts (paginated) |
| GET | `/api/contacts/:id` | Get contact details |
| GET | `/api/contacts/sync/jobs` | Get sync jobs |
| GET | `/api/contacts/sync/jobs/:jobId` | Get sync job status |
| POST | `/api/contacts/sync/jobs/:jobId/resume` | Resume failed job |

### Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/contacts/:contactId/notes` | Create a note |
| GET | `/api/contacts/:contactId/notes` | Get contact notes |
| DELETE | `/api/notes/:noteId` | Delete a note |
| POST | `/api/notes/retry-sync` | Retry failed note syncs |
| GET | `/api/notes/sync-status` | Get note sync status |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

## 📈 Scalability Design

### Current Architecture (Scalable to 100K contacts/min)

1. **Queue-Based Processing**: BullMQ decouples HTTP requests from sync operations
2. **Batch Processing**: Contacts processed in configurable batches (default: 100)
3. **Rate Limiting**: Token bucket algorithm respects HubSpot's limits
4. **Idempotent Operations**: Upsert operations prevent duplicates
5. **Cursor-Based Pagination**: Resumable syncs that survive interruptions
6. **Connection Pooling**: Prisma manages database connections efficiently
7. **Horizontal Scaling**: Multiple worker instances can process the same queue

### Scaling Further

To scale beyond 100K contacts/min:

1. **Multiple Worker Instances**: Deploy workers across multiple servers
2. **Database Sharding**: Partition contacts by portal ID
3. **Read Replicas**: Separate read and write databases
4. **Cache Layer**: Redis cache for frequently accessed data
5. **Event Sourcing**: Track all changes for audit and replay
6. **Webhook Integration**: Real-time updates instead of polling

## 🤔 Assumptions

1. **Single User Per Portal**: Each HubSpot portal has one connected user
2. **SQLite for Development**: Production should use PostgreSQL
3. **Redis Available**: Required for job queue functionality
4. **HubSpot API Limits**: 100 requests per 10 seconds per portal
5. **Token Refresh**: Tokens are refreshed 5 minutes before expiry
6. **Batch Size**: 100 contacts per API call (HubSpot maximum)
7. **Retry Strategy**: 5 attempts with exponential backoff

## ⚠️ Limitations

1. **No Webhook Support**: Currently uses polling, not real-time webhooks
2. **Single Portal**: One HubSpot portal per user account
3. **No Incremental Sync**: Full sync on each trigger (can be optimized)
4. **SQLite for Dev**: Not suitable for production with multiple workers
5. **No Auth for Demo**: Simplified auth for demonstration purposes

## 🚀 Future Improvements

1. **Webhook Support**: Real-time contact updates from HubSpot
2. **Incremental Sync**: Only sync changed contacts using `lastmodifieddate`
3. **Multi-Portal Support**: Connect multiple HubSpot accounts
4. **User Authentication**: Full user registration and login
5. **Contact Segmentation**: Sync HubSpot lists and segments
6. **Email Integration**: Sync email interactions
7. **Advanced Analytics**: Sync activity metrics and dashboards
8. **Bulk Operations**: Batch create/update contacts
9. **Conflict Resolution**: Handle concurrent updates
10. **Audit Logging**: Track all sync operations

## 📝 License

This project is created for technical assessment purposes.

## 👥 Contributing

This is a technical assessment submission. For questions or feedback, please contact the repository owner.
