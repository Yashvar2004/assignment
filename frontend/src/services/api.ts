import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type {
  ApiResponse,
  Contact,
  ConnectionStatus,
  Note,
  NoteSyncStatus,
  PaginatedResponse,
  SyncJob,
} from '../types';

// Create axios instance with defaults
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('hubspot_sync_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('hubspot_sync_token');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// ==================== Auth API ====================

export const authApi = {
  /**
   * Get HubSpot OAuth authorization URL
   */
  getAuthUrl: async (): Promise<string> => {
    const response = await api.get<ApiResponse<{ url: string }>>('/auth/hubspot');
    return response.data.data.url;
  },

  /**
   * Check connection status
   */
  checkConnection: async (): Promise<ConnectionStatus> => {
    const response = await api.get<ApiResponse<ConnectionStatus>>('/auth/status');
    return response.data.data;
  },

  /**
   * Disconnect HubSpot account
   */
  disconnect: async (): Promise<void> => {
    await api.post('/auth/disconnect');
  },
};

// ==================== Contacts API ====================

export const contactsApi = {
  /**
   * Trigger contact sync
   */
  syncContacts: async (): Promise<{ jobId: string; totalContacts: number }> => {
    const response = await api.post<ApiResponse<{ jobId: string; totalContacts: number }>>(
      '/contacts/sync'
    );
    return response.data.data;
  },

  /**
   * Get paginated contacts list
   */
  getContacts: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Contact>> => {
    const response = await api.get<ApiResponse<PaginatedResponse<Contact>>>('/contacts', {
      params,
    });
    return response.data.data;
  },

  /**
   * Get single contact with notes
   */
  getContactById: async (id: string): Promise<Contact> => {
    const response = await api.get<ApiResponse<Contact>>(`/contacts/${id}`);
    return response.data.data;
  },

  /**
   * Get sync jobs
   */
  getSyncJobs: async (): Promise<SyncJob[]> => {
    const response = await api.get<ApiResponse<SyncJob[]>>('/contacts/sync/jobs');
    return response.data.data;
  },

  /**
   * Get sync job status
   */
  getSyncJobStatus: async (jobId: string): Promise<SyncJob> => {
    const response = await api.get<ApiResponse<SyncJob>>(`/contacts/sync/jobs/${jobId}`);
    return response.data.data;
  },

  /**
   * Resume a failed sync job
   */
  resumeSyncJob: async (jobId: string): Promise<void> => {
    await api.post(`/contacts/sync/jobs/${jobId}/resume`);
  },
};

// ==================== Notes API ====================

export const notesApi = {
  /**
   * Create a note for a contact
   */
  createNote: async (contactId: string, body: string): Promise<Note> => {
    const response = await api.post<ApiResponse<Note>>(
      `/contacts/${contactId}/notes`,
      { body }
    );
    return response.data.data;
  },

  /**
   * Get notes for a contact
   */
  getNotes: async (
    contactId: string,
    params?: { page?: number; limit?: number }
  ): Promise<PaginatedResponse<Note>> => {
    const response = await api.get<ApiResponse<PaginatedResponse<Note>>>(
      `/contacts/${contactId}/notes`,
      { params }
    );
    return response.data.data;
  },

  /**
   * Delete a note
   */
  deleteNote: async (noteId: string): Promise<void> => {
    await api.delete(`/notes/${noteId}`);
  },

  /**
   * Retry syncing failed notes
   */
  retryFailedSyncs: async (): Promise<{
    total: number;
    retried: number;
    successful: number;
    failed: number;
  }> => {
    const response = await api.post<
      ApiResponse<{ total: number; retried: number; successful: number; failed: number }>
    >('/notes/retry-sync');
    return response.data.data;
  },

  /**
   * Get note sync status
   */
  getNoteSyncStatus: async (): Promise<NoteSyncStatus> => {
    const response = await api.get<ApiResponse<NoteSyncStatus>>('/notes/sync-status');
    return response.data.data;
  },
};

export default api;
