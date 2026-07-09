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

- **OAuth 2.0 Authentication** - Secure connection to HubSpot accounts
- **Automatic Contact Synchronization** - Background sync of contacts using queue-based processing
- **Bidirectional Note Sync** - Notes created in the app sync back to HubSpot as engagements
- **Production-Ready Architecture** - Designed to scale to 100,000+ contacts per minute

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
│  ┌──────────┐                                                    │
│  │ Prisma   │                                                    │
│  │ (PostgreSQL)                                                 │
│  └──────────┘                                                    │
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
| ORM | Prisma | Type-safe queries, migrations, excellent DX |
| Database | PostgreSQL (Neon) | Production-ready, scalable |

### Frontend
| Technology | Choice | Rationale |
|------------|--------|-----------|
| Framework | React 18 | Component-based, huge ecosystem |
| Build Tool | Vite | Fast HMR, optimized builds |
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
  - PAT token fallback for development

- [x] **Automatic Contact Synchronization**
  - Auto-triggered after OAuth connection
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
- [x] **Error Recovery** - Resumable syncs after failures
- [x] **Health Checks** - Database connection monitoring

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- HubSpot Developer Account
- Neon PostgreSQL database (or any PostgreSQL)

### 1. Clone the Repository
```bash
git clone https://github.com/Yashvar2004/assignment.git
cd assignment
```

### 2. Set Up HubSpot App
1. Go to HubSpot Developer Portal
2. Create a new app (Legacy App or CLI project)
3. Configure OAuth settings:
   - Redirect URL: `https://your-backend-url/api/auth/hubspot/callback`
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
# DATABASE_URL=your_postgresql_connection_string
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

## 🔧 Environment Variables

### Backend (.env)
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/hubspot_sync"

# HubSpot OAuth
HUBSPOT_CLIENT_ID=your_client_id
HUBSPOT_CLIENT_SECRET=your_client_secret
HUBSPOT_REDIRECT_URI=http://localhost:3001/api/auth/hubspot/callback

# HubSpot PAT (fallback)
HUBSPOT_PAT_TOKEN=your_pat_token

# JWT
JWT_SECRET=your_secure_jwt_secret

# Frontend URL
FRONTEND_URL=http://localhost:5173

# Environment
NODE_ENV=development
```

## 💻 Local Development

### Running the Application

1. **Start Backend:**
```bash
cd backend
npm run dev
# Server runs on http://localhost:3001
```

2. **Start Frontend:**
```bash
cd frontend
npm run dev
# App runs on http://localhost:5173
```

3. **Open Browser:**
Navigate to `http://localhost:5173`

## 🚢 Deployment

### Frontend (Vercel)
1. Push code to GitHub
2. Connect repository to Vercel
3. Set Root Directory to `frontend`
4. Configure environment variables
5. Deploy

### Backend (Vercel)
1. Create new Vercel project
2. Set Root Directory to `backend`
3. Add environment variables:
   - `DATABASE_URL`
   - `HUBSPOT_PAT_TOKEN`
   - `JWT_SECRET`
   - `FRONTEND_URL`
   - `NODE_ENV`
4. Deploy

### Database (Neon)
1. Create account at neon.tech
2. Create new project
3. Copy connection string to `DATABASE_URL`

## 📚 API Documentation

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/hubspot` | Get OAuth authorization URL |
| GET | `/api/auth/hubspot/callback` | OAuth callback handler |
| POST | `/api/auth/connect-pat` | Connect with PAT token |
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
- **Queue-Based Processing**: Background sync decouples HTTP requests from sync operations
- **Batch Processing**: Contacts processed in configurable batches (default: 100)
- **Idempotent Operations**: Upsert operations prevent duplicates
- **Cursor-Based Pagination**: Resumable syncs that survive interruptions
- **Connection Pooling**: Prisma manages database connections efficiently

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
2. **PostgreSQL for Production**: SQLite for development, PostgreSQL for production
3. **HubSpot API Limits**: 100 requests per 10 seconds per portal
4. **Token Refresh**: Tokens are refreshed 5 minutes before expiry
5. **Batch Size**: 100 contacts per API call (HubSpot maximum)
6. **Retry Strategy**: 5 attempts with exponential backoff

## ⚠️ Limitations

1. **No Webhook Support**: Currently uses polling, not real-time webhooks
2. **Single Portal**: One HubSpot portal per user account
3. **No Incremental Sync**: Full sync on each trigger (can be optimized)
4. **No Auth for Demo**: Simplified auth for demonstration purposes

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
