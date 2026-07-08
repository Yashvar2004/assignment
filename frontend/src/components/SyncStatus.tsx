import React, { useState, useEffect } from 'react';
import { contactsApi, notesApi } from '../services/api';
import type { SyncJob, NoteSyncStatus } from '../types';

const SyncStatus: React.FC = () => {
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [noteStatus, setNoteStatus] = useState<NoteSyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const [jobs, noteSync] = await Promise.all([
        contactsApi.getSyncJobs(),
        notesApi.getNoteSyncStatus(),
      ]);
      setSyncJobs(jobs);
      setNoteStatus(noteSync);
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResume = async (jobId: string) => {
    try {
      await contactsApi.resumeSyncJob(jobId);
      fetchStatus();
    } catch (error) {
      console.error('Failed to resume job:', error);
    }
  };

  const handleRetryNotes = async () => {
    try {
      await notesApi.retryFailedSyncs();
      fetchStatus();
    } catch (error) {
      console.error('Failed to retry note syncs:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'completed_with_errors':
        return 'bg-yellow-100 text-yellow-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        );
      case 'running':
        return (
          <svg className="animate-spin w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <svg className="animate-spin h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Sync Status</h1>

      {/* Note Sync Status */}
      {noteStatus && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Notes Sync Status</h2>
            {noteStatus.failed > 0 && (
              <button
                onClick={handleRetryNotes}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-orange-500 hover:bg-orange-600"
              >
                Retry Failed
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{noteStatus.total}</div>
              <div className="text-sm text-gray-500">Total Notes</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{noteStatus.synced}</div>
              <div className="text-sm text-green-600">Synced</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-600">{noteStatus.pending}</div>
              <div className="text-sm text-yellow-600">Pending</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600">{noteStatus.failed}</div>
              <div className="text-sm text-red-600">Failed</div>
            </div>
          </div>

          {/* Progress bar */}
          {noteStatus.total > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-500 mb-1">
                <span>Sync Progress</span>
                <span>{Math.round((noteStatus.synced / noteStatus.total) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(noteStatus.synced / noteStatus.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sync Jobs History */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Sync Jobs History</h2>

        {syncJobs.length === 0 ? (
          <div className="text-center py-8">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No sync jobs</h3>
            <p className="mt-1 text-sm text-gray-500">
              Sync jobs will appear here after you sync contacts
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {syncJobs.map((job) => (
              <div
                key={job.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    {getStatusIcon(job.status)}
                    <span className="ml-2 font-medium text-gray-900">
                      {job.type === 'contact_sync' ? 'Contact Sync' : 'Note Sync'}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}
                  >
                    {job.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Progress */}
                {job.totalItems && (
                  <div className="mb-2">
                    <div className="flex justify-between text-sm text-gray-500 mb-1">
                      <span>Progress</span>
                      <span>
                        {job.processed} / {job.totalItems}
                        {job.failed > 0 && ` (${job.failed} failed)`}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.round((job.processed / job.totalItems) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Error message */}
                {job.error && (
                  <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
                    {job.error}
                  </div>
                )}

                {/* Timestamps and actions */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-500">
                    Started: {new Date(job.createdAt).toLocaleString()}
                  </span>
                  {job.status === 'failed' && (
                    <button
                      onClick={() => handleResume(job.id)}
                      className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                    >
                      Resume
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncStatus;
