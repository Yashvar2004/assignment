import React, { useState, useEffect } from 'react';
import { contactsApi, notesApi } from '../services/api';
import type { SyncJob, NoteSyncStatus } from '../types';

const SyncStatus: React.FC = () => {
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [noteStatus, setNoteStatus] = useState<NoteSyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
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
      case 'completed': return 'badge-success';
      case 'completed_with_errors': return 'badge-warning';
      case 'running': return 'badge-info';
      case 'failed': return 'badge-error';
      default: return 'badge-info';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        );
      case 'running':
        return <div className="spinner w-5 h-5 border-2 border-blue-500 border-t-transparent"></div>;
      case 'failed':
        return (
          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="text-center">
          <div className="spinner w-12 h-12 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sync status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Sync Status</h1>

      {/* Note Sync Status */}
      {noteStatus && (
        <div className="card p-8 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Notes Sync Status</h2>
            {noteStatus.failed > 0 && (
              <button onClick={handleRetryNotes} className="btn-primary">
                Retry Failed
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="p-6 bg-gray-50 rounded-xl text-center">
              <div className="text-3xl font-bold text-gray-900">{noteStatus.total}</div>
              <div className="text-sm text-gray-600 mt-1">Total Notes</div>
            </div>
            <div className="p-6 bg-green-50 rounded-xl text-center">
              <div className="text-3xl font-bold text-green-600">{noteStatus.synced}</div>
              <div className="text-sm text-green-600 mt-1">Synced</div>
            </div>
            <div className="p-6 bg-yellow-50 rounded-xl text-center">
              <div className="text-3xl font-bold text-yellow-600">{noteStatus.pending}</div>
              <div className="text-sm text-yellow-600 mt-1">Pending</div>
            </div>
            <div className="p-6 bg-red-50 rounded-xl text-center">
              <div className="text-3xl font-bold text-red-600">{noteStatus.failed}</div>
              <div className="text-sm text-red-600 mt-1">Failed</div>
            </div>
          </div>

          {noteStatus.total > 0 && (
            <div className="mt-6">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Sync Progress</span>
                <span className="font-medium">{Math.round((noteStatus.synced / noteStatus.total) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${(noteStatus.synced / noteStatus.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sync Jobs History */}
      <div className="card p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Sync Jobs History</h2>

        {syncJobs.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No sync jobs yet</h3>
            <p className="text-gray-600">Sync jobs will appear here after you sync contacts</p>
          </div>
        ) : (
          <div className="space-y-4">
            {syncJobs.map((job, index) => (
              <div
                key={job.id}
                className="p-6 bg-gray-50 rounded-xl animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(job.status)}
                    <span className="font-semibold text-gray-900">
                      {job.type === 'contact_sync' ? 'Contact Sync' : 'Note Sync'}
                    </span>
                  </div>
                  <span className={`badge ${getStatusColor(job.status)}`}>
                    {job.status.replace('_', ' ')}
                  </span>
                </div>

                {job.totalItems && (
                  <div className="mb-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Progress</span>
                      <span className="font-medium">
                        {job.processed} / {job.totalItems}
                        {job.failed > 0 && ` (${job.failed} failed)`}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-orange-500 to-orange-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round((job.processed / job.totalItems) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {job.error && (
                  <div className="p-4 bg-red-50 rounded-lg text-sm text-red-600">
                    {job.error}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <span className="text-sm text-gray-500">
                    Started: {new Date(job.createdAt).toLocaleString()}
                  </span>
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
