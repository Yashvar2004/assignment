export interface User {
  id: string;
  hubspotPortalId: string;
  portalName: string | null;
  createdAt: string;
}

export interface Contact {
  id: string;
  hubspotId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  lifecycleStage: string | null;
  leadStatus: string | null;
  city: string | null;
  country: string | null;
  hsCreatedAt: string | null;
  hsUpdatedAt: string | null;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
  notes?: Note[];
  _count?: {
    notes: number;
  };
}

export interface Note {
  id: string;
  hubspotEngagementId: string | null;
  contactId: string;
  body: string;
  syncedToHubspot: boolean;
  syncAttempts: number;
  lastSyncError: string | null;
  lastSyncAttempt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncJob {
  id: string;
  userId: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled';
  totalItems: number | null;
  processed: number;
  failed: number;
  cursor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface ConnectionStatus {
  connected: boolean;
  portalName?: string;
  portalId?: string;
  tokenValid?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    message: string;
    statusCode?: number;
  };
}

export interface NoteSyncStatus {
  total: number;
  synced: number;
  pending: number;
  failed: number;
}
