# Technical Documentation — HubSpot Sync Application

## Table of Contents

1. [System Architecture](#system-architecture)
2. [OAuth Implementation](#oauth-implementation)
3. [Database Schema](#database-schema)
4. [Synchronization Flow](#synchronization-flow)
5. [Background Processing Strategy](#background-processing-strategy)
6. [Error Handling](#error-handling)
7. [Retry Strategy](#retry-strategy)
8. [Scalability Approach](#scalability-approach)
9. [Design Decisions and Tradeoffs](#design-decisions-and-tradeoffs)

## 1. System Architecture

### High-Level Architecture

The application follows a three-tier architecture:

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

### Component Responsibilities

**Frontend:**
- User interface rendering with React
- OAuth redirect handling
- API communication via Axios with interceptors
- Client-side routing with React Router
- Real-time updates via polling

**Backend:**
- RESTful API endpoints
- OAuth 2.0 token management with automatic refresh
- Background sync orchestration
- Rate limiting (API and HubSpot)
- Retry with exponential backoff
- Database operations via Prisma ORM

**Database (PostgreSQL via Neon):**
- User token storage (OAuth credentials)
- Contact data persistence
- Note storage with sync status
- Sync job tracking with cursor

## 2. OAuth Implementation

### OAuth 2.0 Authorization Code Flow

```
┌──────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ User │────▶│ Frontend │────▶│ Backend  │────▶│ HubSpot  │
└──────┘     └──────────┘     └──────────┘     └──────────┘
    │              │              │                   │
    │  Click       │              │                   │
    │  Connect     │  GET         │                   │
    │              │  /api/auth/  │                   │
    │              │  hubspot     │  Return OAuth URL  │
    │              │◀─────────────│                   │
    │  Redirect    │              │                   │
    │  to HubSpot  │              │                   │
    │───────────────────────────────────────────────▶│
    │              │              │                   │
    │  User        │              │                   │
    │  Authorizes  │              │                   │
    │◀───────────────────────────────────────────────│
    │              │              │                   │
    │              │  Callback    │                   │
    │              │  with code   │  Exchange code    │
    │              │─────────────▶│  for tokens       │
    │              │              │──────────────────▶│
    │              │              │                   │
    │              │              │  Access + Refresh │
    │              │              │  tokens           │
    │              │              │◀──────────────────│
    │              │              │                   │
    │              │              │  Store tokens     │
    │              │              │  in database      │
    │              │              │                   │
    │              │  Redirect    │                   │
    │              │  with JWT    │                   │
    │              │◀─────────────│                   │
    │              │              │                   │
    │  Store JWT   │              │                   │
    │  in localStorage           │                   │
    │◀─────────────│              │                   │
```

### Token Refresh Implementation

```javascript
async function refreshHubspotToken(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  // Check if token needs refresh (5 minutes before expiry)
  const bufferTime = 5 * 60 * 1000;
  const tokenExpiry = new Date(user.tokenExpiresAt);

  if (tokenExpiry.getTime() - bufferTime > Date.now()) {
    return user.accessToken; // Token still valid
  }

  // Skip refresh for PAT tokens
  if (user.refreshToken === 'pat-refresh') {
    return user.accessToken;
  }

  // Refresh token
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

  return access_token;
}
```

## 3. Database Schema

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                           User                                  │
├─────────────────────────────────────────────────────────────────┤
│ id              String   @id @default(cuid())                   │
│ hubspotPortalId String   @unique                                │
│ portalName      String?                                         │
│ accessToken     String                                          │
│ refreshToken    String                                          │
│ tokenExpiresAt  DateTime                                        │
│ scopes          String?                                         │
│ createdAt       DateTime @default(now())                        │
│ updatedAt       DateTime @updatedAt                             │
└─────────────────────────────────────────────────────────────────┘
         │                    │
         │                    │
         ▼                    ▼
┌─────────────────────┐  ┌─────────────────────────────────────────┐
│      Contact        │  │              SyncJob                    │
├─────────────────────┤  ├─────────────────────────────────────────┤
│ id           String │  │ id            String                    │
│ hubspotId    String │  │ userId        String (FK → User)        │
│ userId       String │  │ type          String                    │
│ email        String?│  │ status        String @default("pending")│
│ firstName    String?│  │ totalItems    Int?                      │
│ lastName     String?│  │ processed     Int @default(0)           │
│ phone        String?│  │ failed        Int @default(0)           │
│ company      String?│  │ cursor        String?                   │
│ jobTitle     String?│  │ startedAt     DateTime?                 │
│ lifecycleStage String?│ │ completedAt   DateTime?                │
│ city         String?│  │ error         String?                   │
│ country      String?│  │ createdAt     DateTime @default(now())  │
│ hsCreatedAt  DateTime?│ │ updatedAt     DateTime @updatedAt      │
│ hsUpdatedAt  DateTime?│ └─────────────────────────────────────────┘
│ lastSyncedAt DateTime│
│ createdAt    DateTime│
│ updatedAt    DateTime│
└─────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Note                                  │
├─────────────────────────────────────────────────────────────────┤
│ id                   String   @id @default(cuid())              │
│ hubspotEngagementId  String?  @unique                           │
│ contactId            String   (FK → Contact)                    │
│ body                 String                                     │
│ syncedToHubspot      Boolean  @default(false)                   │
│ syncAttempts         Int      @default(0)                       │
│ lastSyncError        String?                                    │
│ lastSyncAttempt      DateTime?                                  │
│ createdAt            DateTime @default(now())                    │
│ updatedAt            DateTime @updatedAt                        │
└─────────────────────────────────────────────────────────────────┘
```

### Indexes

```sql
-- Performance indexes
CREATE INDEX idx_contact_user ON Contact(userId);
CREATE INDEX idx_contact_email ON Contact(email);
CREATE INDEX idx_note_contact ON Note(contactId);
CREATE INDEX idx_note_synced ON Note(syncedToHubspot);
CREATE INDEX idx_syncjob_user_status ON SyncJob(userId, status);
```

## 4. Synchronization Flow

### Contact Sync Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Contact Sync Flow                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User connects HubSpot (OAuth or PAT)                        │
│           ↓                                                      │
│  2. SyncJob created (status: 'running')                         │
│           ↓                                                      │
│  3. Fetch total count from HubSpot API                          │
│           ↓                                                      │
│  4. Update SyncJob with totalItems                              │
│           ↓                                                      │
│  5. Loop with cursor pagination:                                │
│      a. Rate limit check (100 req/10s)                          │
│      b. Fetch 100 contacts with retry (5 attempts)              │
│      c. Upsert each contact (idempotent)                        │
│      d. Update SyncJob progress (processed, cursor)             │
│      e. Move cursor to next page                                │
│           ↓                                                      │
│  6. Mark SyncJob as 'completed'                                 │
│           ↓                                                      │
│  7. Frontend auto-refreshes contact list                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Note Sync Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Note Sync Flow                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User adds note in application                               │
│           ↓                                                      │
│  2. Note saved to database (syncedToHubspot: false)             │
│           ↓                                                      │
│  3. Background sync starts:                                     │
│      a. Refresh token if needed (5 min buffer)                  │
│      b. Rate limit check                                        │
│      c. Create engagement in HubSpot API                        │
│      d. Update note with hubspotEngagementId                    │
│      e. Set syncedToHubspot: true                               │
│           ↓                                                      │
│  4. On failure:                                                 │
│      a. Increment syncAttempts                                  │
│      b. Store error message                                     │
│      c. Retry with exponential backoff (1s, 2s, 4s, 8s, 16s)   │
│      d. Max 5 attempts before marking as failed                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 5. Background Processing Strategy

### Current Implementation (In-Process)

```javascript
// Sync runs in background after API response
app.post('/api/contacts/sync', authenticate, async (req, res) => {
  const syncJob = await prisma.syncJob.create({ ... });

  // Non-blocking - runs after response sent
  syncContactsInBackground(user.id, user.id, syncJob.id);

  res.json({ success: true, data: { jobId: syncJob.id } });
});
```

### Production Architecture (BullMQ + Redis)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Server    │────▶│   Redis Queue   │────▶│   Worker(s)     │
│   (Express)     │     │   (BullMQ)      │     │   (Separate)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        │                                               │
        ▼                                               ▼
┌─────────────────┐                             ┌─────────────────┐
│   Database      │◀────────────────────────────│   HubSpot API   │
│   (PostgreSQL)  │                             │                 │
└─────────────────┘                             └─────────────────┘
```

## 6. Error Handling

### Error Response Format

```javascript
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE"  // Optional
  }
}
```

### Error Categories

| Category | HTTP Status | Action |
|----------|-------------|--------|
| Validation | 400 | Return details |
| Authentication | 401 | Clear token, redirect |
| Authorization | 403 | Return error |
| Not Found | 404 | Return error |
| Rate Limit | 429 | Return retry-after |
| Server Error | 500 | Log, return generic |

## 7. Retry Strategy

### Exponential Backoff with Jitter

```javascript
async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 5,
    backoffBase = 1000,  // 1 second
    maxBackoff = 60000,  // 1 minute
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      if (!isRetryable(error)) throw error;

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      const backoff = Math.min(
        backoffBase * Math.pow(2, attempt - 1),
        maxBackoff
      );

      // Add jitter (50-100% of backoff) to prevent thundering herd
      const jitter = backoff * (0.5 + Math.random() * 0.5);

      await new Promise(resolve => setTimeout(resolve, jitter));
    }
  }
}
```

### Retryable Errors

| Error | Retryable | Reason |
|-------|-----------|--------|
| 429 Rate Limit | ✅ | Temporary, will recover |
| 500 Server Error | ✅ | Temporary HubSpot issue |
| 502 Bad Gateway | ✅ | Temporary infrastructure |
| 503 Service Unavailable | ✅ | Temporary overload |
| 400 Bad Request | ❌ | Client error, won't change |
| 401 Unauthorized | ❌ | Token invalid, need refresh |
| 404 Not Found | ❌ | Resource doesn't exist |

## 8. Scalability Approach

### Current Capacity

| Metric | Current | Production Target |
|--------|---------|-------------------|
| Contacts per sync | 100 (batch) | 100,000 |
| Sync duration | ~5s per 100 | ~60s per 100K |
| Concurrent users | ~10 | 1,000+ |
| API requests/min | 100 | 10,000 |

### Scaling Strategies

1. **Horizontal Scaling (API Servers)**
   - Stateless JWT authentication
   - No server-side sessions
   - Load balancer ready

2. **Queue-Based Processing**
   - Extract sync jobs to BullMQ + Redis
   - Multiple worker processes
   - Job prioritization

3. **Database Optimization**
   - Connection pooling (Prisma default)
   - Read replicas for queries
   - Batch inserts for bulk sync

4. **Caching Layer**
   - Redis for frequently accessed data
   - Cache invalidation strategy

### Production Architecture

```
                    ┌─────────────────┐
                    │   Load Balancer │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
     │ API Server 1│ │ API Server 2│ │ API Server 3│
     └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
            │              │              │
            └──────────────┼──────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Redis    │
                    │   (Queue)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
     ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
     │  Worker 1   │ │  Worker 2   │ │  Worker 3   │
     └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
            │              │              │
            └──────────────┼──────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  PostgreSQL │
                    │  (Primary)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
     ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
     │  Replica 1  │ │  Replica 2  │ │  Replica 3  │
     └─────────────┘ └─────────────┘ └─────────────┘
```

## 9. Design Decisions and Tradeoffs

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| **Express.js** | Simplicity, vast ecosystem, rapid development | Less structured than NestJS |
| **Prisma ORM** | Type safety, auto-migrations, excellent DX | Learning curve, less raw SQL control |
| **PostgreSQL** | ACID compliance, scalability, JSON support | More complex setup than SQLite |
| **Neon** | Serverless PostgreSQL, free tier, connection pooling | Vendor lock-in |
| **In-process jobs** | Simplicity for assignment scope | Not horizontally scalable |
| **Cursor pagination** | Resumable syncs, efficient for large datasets | More complex than offset pagination |
| **Exponential backoff** | Prevents thundering herd, graceful degradation | Longer recovery time |
| **JWT authentication** | Stateless, scalable, no server-side sessions | Token can't be revoked |
| **Rate limiting** | Protects API, respects HubSpot limits | May block legitimate requests |

### Why These Choices

1. **Express.js + Prisma**: Fastest path to production-ready code with type safety
2. **PostgreSQL + Neon**: Production-grade database with serverless hosting
3. **Cursor pagination**: Essential for resumable syncs with 100K+ contacts
4. **Exponential backoff**: Industry standard for API retry, prevents cascading failures
5. **In-process jobs**: Appropriate for assignment scope, easily extractable to workers
