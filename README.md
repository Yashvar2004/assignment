# HubSpot Sync - Contact Management Integration

A full-stack application that integrates with HubSpot, synchronizes contacts, and keeps notes synchronized between the application and HubSpot.

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
- [API Documentation](#api-documentation)
- [Scalability Design](#scalability-design)
- [Known Limitations](#known-limitations)

## 🎯 Project Overview

This application provides:

- **HubSpot OAuth 2.0 Integration** — Secure connection with automatic token refresh
- **Contact Synchronization** — Background sync with cursor-based pagination
- **Bidirectional Note Sync** — Notes created in the app sync to HubSpot with automatic retry
- **Rate Limiting** — Respects HubSpot API limits (100 requests/10 seconds)
- **Automatic Retry** — Exponential backoff for failed operations

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

## 💻 Technology Choices

### Backend
| Technology | Choice | Rationale |
|------------|--------|-----------|
| Runtime | Node.js 22 | JavaScript everywhere, excellent async support |
| Framework | Express.js | Mature, well-documented, flexible |
| ORM | Prisma | Type-safe queries, migrations, excellent DX |
| Database | PostgreSQL (Neon) | Production-ready, scalable |
| Rate Limiting | express-rate-limit | Standard Express middleware |
| HTTP Client | Axios | Retry interceptors, automatic JSON parsing |

### Frontend
| Technology | Choice | Rationale |
|------------|--------|-----------|
| Framework | React 18 | Component-based, huge ecosystem |
| Build Tool | Vite | Fast HMR, optimized builds |
| Styling | Tailwind CSS | Utility-first, rapid development |
| Routing | React Router | Standard routing solution |

## ✅ Features Implemented

### 1. HubSpot OAuth Integration
- ✅ OAuth 2.0 authorization code flow
- ✅ Token exchange with authorization code
- ✅ **Automatic token refresh** — Refreshes tokens 5 minutes before expiry
- ✅ Secure token storage in PostgreSQL
- ✅ PAT token fallback for development

### 2. Contact Synchronization
- ✅ **Cursor-based pagination** — Resumable syncs that survive interruptions
- ✅ **Idempotent upsert operations** — No duplicate records
- ✅ **Rate limiting** — 100 requests per 10 seconds (HubSpot limit)
- ✅ **Automatic retry** — Exponential backoff with jitter (5 attempts)
- ✅ Background processing (non-blocking)
- ✅ Real-time progress tracking
- ✅ Error handling with detailed logging

### 3. Contact Notes
- ✅ Create notes from the application
- ✅ **Automatic sync to HubSpot** — Notes sync as engagements
- ✅ **Automatic retry on failure** — Up to 5 attempts with exponential backoff
- ✅ Sync status tracking per note
- ✅ Manual retry for failed syncs

### 4. Security
- ✅ **No hardcoded secrets** — JWT_SECRET must be set via environment variable
- ✅ **Rate limiting** — General (100 req/15min) and sync-specific (5 req/min)
- ✅ **Input validation** — All inputs validated before processing
- ✅ **Error handling** — No sensitive data in error responses

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

# Create .env file with required variables
# DATABASE_URL, JWT_SECRET, HUBSPOT_PAT_TOKEN (or OAuth credentials)

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Start server
npm start
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## 🔧 Environment Variables

### Backend (Required)
```env
# Database (Required)
DATABASE_URL="postgresql://..."

# JWT Secret (Required - no fallback)
JWT_SECRET="your-secure-random-string"

# HubSpot PAT Token (for development)
HUBSPOT_PAT_TOKEN="pat-na2-..."

# HubSpot OAuth (for production)
HUBSPOT_CLIENT_ID="your-client-id"
HUBSPOT_CLIENT_SECRET="your-client-secret"
HUBSPOT_REDIRECT_URI="https://your-backend-url/api/auth/hubspot/callback"

# Frontend URL
FRONTEND_URL="https://your-frontend-url.vercel.app"

# Environment
NODE_ENV="production"
```

## 📚 API Documentation

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/hubspot` | Get OAuth authorization URL |
| GET | `/api/auth/hubspot/callback` | OAuth callback handler |
| POST | `/api/auth/connect-pat` | Connect with PAT token |
| GET | `/api/auth/status` | Check connection status (includes token validity) |
| POST | `/api/auth/disconnect` | Disconnect HubSpot account |

### Contacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/contacts/sync` | Trigger contact sync (rate limited: 5/min) |
| GET | `/api/contacts` | List contacts (paginated, searchable) |
| GET | `/api/contacts/:id` | Get contact details with notes |
| GET | `/api/contacts/sync/jobs` | Get sync jobs history |
| GET | `/api/contacts/sync/jobs/:jobId` | Get sync job status |

### Notes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/contacts/:contactId/notes` | Create a note (auto-syncs to HubSpot) |
| GET | `/api/contacts/:contactId/notes` | Get contact notes (paginated) |
| DELETE | `/api/notes/:noteId` | Delete a note |
| POST | `/api/notes/retry-sync` | Retry failed note syncs |
| GET | `/api/notes/sync-status` | Get note sync status |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

## 📈 Scalability Design

### Rate Limiting
- **HubSpot API**: 100 requests per 10 seconds (enforced via token bucket)
- **General API**: 100 requests per 15 minutes per IP
- **Sync endpoints**: 5 requests per minute per IP

### Retry Strategy
- **Max attempts**: 5
- **Backoff**: Exponential (1s, 2s, 4s, 8s, 16s)
- **Jitter**: 50-100% of backoff to prevent thundering herd
- **Retryable errors**: 429 (rate limit), 5xx (server errors)

### Token Refresh
- **Automatic**: Checks token expiry before each API call
- **Buffer**: Refreshes 5 minutes before expiry
- **PAT tokens**: Skipped (no expiry)

### Cursor-Based Pagination
- **Resumable**: Syncs can be interrupted and resumed
- **Efficient**: Only fetches new/changed contacts
- **Tracked**: Cursor stored in SyncJob for continuation

## ⚠️ Known Limitations

1. **No queue system**: Background jobs run in-process (not BullMQ/Redis)
   - Impact: Jobs lost if server restarts
   - Mitigation: SyncJob table tracks state for manual recovery

2. **Single worker**: No horizontal scaling for background jobs
   - Impact: Limited throughput for very large syncs
   - Mitigation: Cursor-based pagination allows resumable syncs

3. **No webhook support**: Uses polling instead of real-time webhooks
   - Impact: Changes in HubSpot not immediately reflected
   - Mitigation: Manual sync button available

4. **PAT token fallback**: Development convenience, not production-ready
   - Impact: No automatic token refresh for PAT tokens
   - Mitigation: OAuth flow fully implemented for production use

## 📝 License

This project is created for technical assessment purposes.
