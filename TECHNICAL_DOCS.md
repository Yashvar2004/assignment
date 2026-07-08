# Technical Documentation - HubSpot Sync Application

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

## System Architecture

### High-Level Architecture

The application follows a layered architecture pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│                 (React Frontend on Vercel)                   │
└────────────────────────────┬────────────────────────────────┘
                             │ REST API
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                               │
│              (Express.js with TypeScript)                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐   │
│  │ Routes  │→ │Controllers│→ │Services │→ │  External   │   │
│  │         │  │         │  │         │  │   APIs      │   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Prisma   │  │  BullMQ  │  │  Redis   │                  │
│  │ (ORM)    │  │ (Queue)  │  │ (Cache)  │                  │
│  └────┬─────┘  └────┬─────┘  └──────────┘                  │
│       │              │                                       │
│       ▼              ▼                                       │
│  ┌──────────┐  ┌──────────┐                                 │
│  │ SQLite/  │  │ Workers  │                                 │
│  │ Postgres │  │          │                                 │
│  └──────────┘  └──────────┘                                 │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### Frontend (React + TypeScript)
- **Presentation**: UI components using Tailwind CSS
- **State Management**: React Context for auth state
- **API Communication**: Axios with interceptors
- **Routing**: React Router for navigation

#### Backend (Express.js + TypeScript)
- **API Routes**: RESTful endpoints
- **Controllers**: Request handling and validation
- **Services**: Business logic and orchestration
- **Middleware**: Auth, error handling, logging

#### Data Layer
- **Prisma**: Type-safe database access
- **BullMQ**: Background job processing
- **Redis**: Job queue storage and rate limiting

### Directory Structure

```
backend/
├── src/
│   ├── config/           # Configuration files
│   │   ├── index.ts      # Environment config
│   │   ├── database.ts   # Prisma client
│   │   └── redis.ts      # Redis connection
│   ├── controllers/      # Request handlers
│   ├── middleware/        # Express middleware
│   ├── routes/           # API route definitions
│   ├── services/         # Business logic
│   │   ├── hubspot.service.ts    # HubSpot API client
│   │   ├── oauth.service.ts      # OAuth flow
│   │   ├── contact.service.ts    # Contact sync
│   │   └── note.service.ts       # Note sync
│   ├── workers/          # Background workers
│   ├── queues/           # BullMQ queue definitions
│   └── utils/            # Helper functions
├── prisma/
│   └── schema.prisma     # Database schema
└── package.json
```

## OAuth Implementation

### Flow Diagram

```
User                    Frontend                Backend                  HubSpot
 │                        │                       │                        │
 │  Click "Connect"       │                       │                        │
 ├───────────────────────►│                       │                        │
 │                        │  GET /api/auth/hubspot │                        │
 │                        ├──────────────────────►│                        │
 │                        │                       │  Generate auth URL     │
 │                        │                       ├───────────────────────►│
 │                        │  Return auth URL      │                        │
 │                        │◄──────────────────────┤                        │
 │  Redirect to HubSpot   │                       │                        │
 │◄───────────────────────┤                       │                        │
 │                        │                       │                        │
 │  Authorize app         │                       │                        │
 ├────────────────────────────────────────────────────────────────────────►│
 │                        │                       │                        │
 │                        │                       │  Authorization code    │
 │                        │                       │◄───────────────────────┤
 │                        │                       │                        │
 │                        │                       │  Exchange code for     │
 │                        │                       │  access token          │
 │                        │                       ├───────────────────────►│
 │                        │                       │                        │
 │                        │                       │  Access + Refresh      │
 │                        │                       │  tokens                │
 │                        │                       │◄───────────────────────┤
 │                        │                       │                        │
 │                        │                       │  Store tokens in DB    │
 │                        │                       │  Generate JWT          │
 │                        │  Redirect with JWT    │                        │
 │                        │◄──────────────────────┤                        │
 │  Store JWT             │                       │                        │
 │◄───────────────────────┤                       │                        │
```

### Token Management

#### Token Storage
Tokens are stored encrypted in the database:
- **Access Token**: Short-lived (typically 30 minutes)
- **Refresh Token**: Long-lived (used to get new access tokens)
- **Expiry Time**: Stored to check if refresh is needed

#### Automatic Token Refresh
```typescript
// Check if token needs refresh (with 5 minute buffer)
const now = new Date();
const bufferTime = 5 * 60 * 1000; // 5 minutes
const tokenExpiry = new Date(user.tokenExpiresAt);

if (tokenExpiry.getTime() - bufferTime <= now.getTime()) {
  // Refresh the token
  const newTokens = await HubSpotService.refreshAccessToken(user.refreshToken);
  // Update database with new tokens
}
```

### Security Considerations

1. **HTTPS Only**: All OAuth flows use HTTPS
2. **State Parameter**: Prevents CSRF attacks
3. **Short-Lived Codes**: Authorization codes expire quickly
4. **Secure Storage**: Tokens stored in database, not exposed to frontend
5. **JWT for Session**: Frontend uses JWT for authentication

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐
│     Users       │       │   Contacts      │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │◄──┐   │ id (PK)         │
│ hubspotPortalId │   │   │ hubspotId       │
│ portalName      │   │   │ userId (FK)     │──┐
│ accessToken     │   └───│ email           │  │
│ refreshToken    │       │ firstName       │  │
│ tokenExpiresAt  │       │ lastName        │  │
│ createdAt       │       │ phone           │  │
│ updatedAt       │       │ company         │  │
└─────────────────┘       │ jobTitle        │  │
                          │ lifecycleStage  │  │
                          │ lastSyncedAt    │  │
                          │ createdAt       │  │
                          │ updatedAt       │  │
                          └─────────────────┘  │
                                   │           │
                                   ▼           │
                          ┌─────────────────┐  │
                          │     Notes       │  │
                          ├─────────────────┤  │
                          │ id (PK)         │  │
                          │ hubspotEngagement│  │
                          │ contactId (FK)  │──┘
                          │ body            │
                          │ syncedToHubspot │
                          │ syncAttempts    │
                          │ lastSyncError   │
                          │ createdAt       │
                          │ updatedAt       │
                          └─────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │   SyncJobs      │
                          ├─────────────────┤
                          │ id (PK)         │
                          │ userId (FK)     │
                          │ type            │
                          │ status          │
                          │ totalItems      │
                          │ processed       │
                          │ failed          │
                          │ cursor          │
                          │ error           │
                          │ createdAt       │
                          │ updatedAt       │
                          └─────────────────┘
```

### Key Design Decisions

1. **UUID Primary Keys**: Using `cuid()` for globally unique IDs
2. **Soft References**: HubSpot IDs stored for API correlation
3. **Audit Fields**: `createdAt` and `updatedAt` on all tables
4. **Cascade Deletes**: Deleting a user removes all associated data
5. **Indexes**: On frequently queried fields (userId, hubspotId, email)

## Synchronization Flow

### Contact Synchronization

```
┌─────────────────────────────────────────────────────────────────┐
│                   Contact Sync Flow                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User connects HubSpot account                               │
│     └─► OAuth callback triggers auto-sync                       │
│                                                                  │
│  2. Create SyncJob record (status: 'pending')                   │
│                                                                  │
│  3. Fetch total contact count from HubSpot                      │
│     └─► Update SyncJob.totalItems                               │
│                                                                  │
│  4. Start background sync (non-blocking)                        │
│     └─► Return jobId to frontend immediately                    │
│                                                                  │
│  5. Background Worker Process:                                  │
│     a. Fetch contacts page (100 per page)                       │
│     b. For each contact:                                        │
│        - Upsert into database (idempotent)                      │
│        - Update lastSyncedAt timestamp                          │
│     c. Update SyncJob progress                                  │
│     d. If more pages: enqueue next batch                        │
│     e. If complete: mark job as completed                       │
│                                                                  │
│  6. Frontend polls job status                                   │
│     └─► Updates progress bar                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Note Synchronization

```
┌─────────────────────────────────────────────────────────────────┐
│                    Note Sync Flow                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User creates note in frontend                               │
│                                                                  │
│  2. Note saved to database (syncedToHubspot: false)             │
│                                                                  │
│  3. Background note sync triggered                              │
│     └─► Non-blocking, returns immediately                       │
│                                                                  │
│  4. Note Sync Worker:                                           │
│     a. Get valid access token (refresh if needed)               │
│     b. Create engagement in HubSpot                             │
│     c. Update note with hubspotEngagementId                     │
│     d. Mark syncedToHubspot: true                               │
│                                                                  │
│  5. If sync fails:                                              │
│     - Increment syncAttempts                                    │
│     - Store error message                                       │
│     - Retry with exponential backoff                            │
│                                                                  │
│  6. Manual retry available for failed notes                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Background Processing Strategy

### BullMQ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   BullMQ Architecture                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Producer   │────►│    Redis     │◄────│   Consumer   │    │
│  │  (API Layer) │     │   (Queue)    │     │  (Worker)    │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                                                                  │
│  Queue Features:                                                 │
│  - Persistent job storage                                       │
│  - Automatic retries with backoff                               │
│  - Job prioritization                                           │
│  - Rate limiting                                                │
│  - Job locks to prevent duplicate processing                    │
│  - Progress tracking                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Worker Configuration

```typescript
const contactSyncWorker = new Worker(
  'contact-sync',
  async (job) => {
    // Process job
  },
  {
    connection: redis,
    concurrency: 3,           // Process 3 jobs concurrently
    limiter: {
      max: 10,                // Max 10 jobs
      duration: 1000,         // Per second
    },
  }
);
```

### Job Types

1. **Contact Sync Jobs**
   - `sync-batch`: Process a batch of contacts
   - Resumable via cursor field
   - Automatic retry on failure

2. **Note Sync Jobs**
   - `sync-note`: Sync single note to HubSpot
   - Tracks sync attempts
   - Manual retry available

## Error Handling

### Error Types

```typescript
// Application errors
class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
}

// HubSpot API errors
class HubSpotApiError extends AppError {
  hubspotStatus: number;
  hubspotBody: any;
}

// Rate limit errors
class RateLimitError extends AppError {
  retryAfter: number;
}
```

### Error Handling Strategy

1. **API Layer**: Catch and format errors for frontend
2. **Service Layer**: Log errors, update sync job status
3. **Worker Layer**: Retry with backoff, mark as failed after max attempts
4. **Frontend**: Display user-friendly error messages

### Error Response Format

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "statusCode": 400,
    "details": {}
  }
}
```

## Retry Strategy

### Exponential Backoff with Jitter

```typescript
// Calculate delay
const baseDelay = 1000;  // 1 second
const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
const jitter = Math.random() * 1000;
const delay = Math.min(exponentialDelay + jitter, 60000);  // Max 60 seconds
```

### Retry Configuration

| Operation | Max Attempts | Base Delay | Max Delay |
|-----------|-------------|------------|-----------|
| Contact Sync | 5 | 1s | 60s |
| Note Sync | 5 | 1s | 60s |
| Token Refresh | 3 | 1s | 10s |

### Retryable Errors

- Network errors (ECONNRESET, ETIMEDOUT)
- Rate limit errors (429)
- Server errors (5xx)
- Timeout errors

## Scalability Approach

### Current Capacity

- **Contacts**: 100 per API call (HubSpot maximum)
- **Rate Limit**: 100 requests per 10 seconds per portal
- **Workers**: 3 concurrent sync workers
- **Batch Size**: Configurable (default: 100)

### Scaling to 100K Contacts/Minute

1. **Multiple Worker Instances**
   ```
   # Deploy multiple worker processes
   Worker 1: Processes batches 1-100
   Worker 2: Processes batches 101-200
   Worker 3: Processes batches 201-300
   ```

2. **Connection Pooling**
   - Prisma manages database connections
   - Configurable pool size
   - Automatic connection recycling

3. **Batch Processing**
   - Process contacts in parallel within batches
   - Use `Promise.all` for concurrent operations
   - Configurable batch sizes

4. **Rate Limit Management**
   - Token bucket algorithm in Redis
   - Per-portal rate limiting
   - Automatic wait when limit reached

5. **Queue Optimization**
   - Priority queues for important jobs
   - Job deduplication
   - Bulk job additions

### Horizontal Scaling

```yaml
# Docker Compose scaling
services:
  worker:
    deploy:
      replicas: 10  # Scale workers horizontally
```

## Design Decisions and Tradeoffs

### 1. SQLite vs PostgreSQL (Development)

**Decision**: Use SQLite for local development, PostgreSQL for production

**Rationale**:
- SQLite requires no setup
- Easier for developers to get started
- PostgreSQL for production reliability

**Tradeoff**: Some PostgreSQL features not available in SQLite

### 2. BullMQ vs Simple Queue

**Decision**: Use BullMQ backed by Redis

**Rationale**:
- Persistent job storage
- Automatic retries
- Job prioritization
- Rate limiting built-in
- Battle-tested in production

**Tradeoff**: Requires Redis infrastructure

### 3. Cursor vs Offset Pagination

**Decision**: Use cursor-based pagination for sync

**Rationale**:
- More efficient for large datasets
- Resumable after interruptions
- Consistent results during data changes

**Tradeoff**: Can't jump to arbitrary pages

### 4. Upsert vs Insert

**Decision**: Use upsert for contact synchronization

**Rationale**:
- Prevents duplicate records
- Idempotent operations
- Safe for retry logic

**Tradeoff**: Slightly slower than pure inserts

### 5. JWT vs Session Tokens

**Decision**: Use JWT for frontend authentication

**Rationale**:
- Stateless authentication
- No server-side session storage
- Works well with SPAs

**Tradeoff**: Can't invalidate tokens before expiry

### 6. Polling vs Webhooks

**Decision**: Use polling for sync status (webhooks planned)

**Rationale**:
- Simpler implementation
- Works without public URL
- Easier to debug

**Tradeoff**: Less real-time, more API calls

## Performance Considerations

### Database Optimization

1. **Indexes**: On frequently queried fields
2. **Connection Pooling**: Prisma manages connections
3. **Batch Writes**: Multiple inserts in single transaction
4. **Query Optimization**: Select only needed fields

### API Optimization

1. **Rate Limiting**: Prevent API abuse
2. **Caching**: Redis for frequently accessed data
3. **Compression**: Gzip for API responses
4. **Pagination**: Limit response sizes

### Frontend Optimization

1. **Lazy Loading**: Load components on demand
2. **Debounced Search**: Reduce API calls
3. **Optimistic Updates**: Immediate UI feedback
4. **Error Boundaries**: Graceful error handling

## Monitoring and Observability

### Logging

```typescript
// Structured logging with Winston
logger.info('Contact sync started', {
  userId,
  jobId,
  totalContacts,
});
```

### Health Checks

```typescript
// Health endpoint checks
GET /health
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected",
  "uptime": 12345
}
```

### Metrics (Planned)

- Sync job duration
- Success/failure rates
- API response times
- Queue depth
- Worker utilization

## Security Measures

1. **OAuth 2.0**: Secure authentication with HubSpot
2. **JWT Tokens**: Stateless session management
3. **Input Validation**: Zod schema validation
4. **SQL Injection Prevention**: Prisma parameterized queries
5. **XSS Prevention**: React automatic escaping
6. **CORS**: Configured for frontend domain only
7. **Rate Limiting**: Prevent brute force attacks
8. **Helmet**: Security headers
9. **Environment Variables**: Sensitive data not in code
