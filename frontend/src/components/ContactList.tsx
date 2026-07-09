import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { contactsApi } from '../services/api';
import type { Contact, SyncJob } from '../types';

const ContactList: React.FC = () => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [syncJob, setSyncJob] = useState<SyncJob | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchContacts = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await contactsApi.getContacts({
        page,
        limit: 20,
        search: search || undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      setContacts(result.data);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    if (!syncJob || syncJob.status === 'completed' || syncJob.status === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const job = await contactsApi.getSyncJobStatus(syncJob.id);
        setSyncJob(job);

        if (job.status === 'completed' || job.status === 'failed') {
          setIsSyncing(false);
          fetchContacts();
        }
      } catch (error) {
        console.error('Failed to poll sync status:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [syncJob, fetchContacts]);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      const result = await contactsApi.syncContacts();
      const job = await contactsApi.getSyncJobStatus(result.jobId);
      setSyncJob(job);
    } catch (error) {
      console.error('Failed to start sync:', error);
      setIsSyncing(false);
    }
  };

  const getFullName = (contact: Contact) => {
    const parts = [contact.firstName, contact.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Unknown';
  };

  const getInitials = (contact: Contact) => {
    const name = getFullName(contact);
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-600 mt-1">
            {total} contact{total !== 1 ? 's' : ''} synced from HubSpot
          </p>
        </div>

        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="btn-primary inline-flex items-center"
        >
          {isSyncing ? (
            <>
              <div className="spinner w-4 h-4 mr-2 border-2 border-white border-t-transparent"></div>
              Syncing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync Contacts
            </>
          )}
        </button>
      </div>

      {/* Sync Progress */}
      {syncJob && isSyncing && (
        <div className="card p-6 mb-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="spinner w-5 h-5 border-2 border-blue-500 border-t-transparent"></div>
              <span className="font-medium text-gray-900">
                Syncing contacts from HubSpot...
              </span>
            </div>
            <span className="text-sm text-gray-600">
              {syncJob.processed} / {syncJob.totalItems || '?'}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-500"
              style={{
                width: syncJob.totalItems
                  ? `${Math.round((syncJob.processed / syncJob.totalItems) * 100)}%`
                  : '0%',
              }}
            />
          </div>
        </div>
      )}

      {/* Search */}
      <div className="card p-4 mb-6">
        <div className="relative">
          <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search contacts by name, email, or company..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="input pl-12"
          />
        </div>
      </div>

      {/* Contact List */}
      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="text-center">
            <div className="spinner w-12 h-12 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading contacts...</p>
          </div>
        </div>
      ) : contacts.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No contacts found</h3>
          <p className="text-gray-600 mb-6">
            {search ? 'No contacts match your search criteria' : 'Click "Sync Contacts" to fetch contacts from HubSpot'}
          </p>
          {!search && (
            <button onClick={handleSync} className="btn-primary">
              Sync Contacts Now
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th>Stage</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact, index) => (
                  <tr
                    key={contact.id}
                    className="cursor-pointer animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                  >
                    <td>
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-500 rounded-full flex items-center justify-center text-white font-semibold">
                          {getInitials(contact)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{getFullName(contact)}</div>
                          {contact.phone && (
                            <div className="text-sm text-gray-500">{contact.phone}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="text-gray-900">{contact.email || '-'}</span>
                    </td>
                    <td>
                      <span className="text-gray-900">{contact.company || '-'}</span>
                    </td>
                    <td>
                      {contact.lifecycleStage ? (
                        <span className="badge badge-info">
                          {contact.lifecycleStage}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center space-x-1 text-gray-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>{contact._count?.notes || 0}</span>
                      </div>
                    </td>
                    <td>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/contacts/${contact.id}`);
                        }}
                        className="px-4 py-2 text-sm font-medium text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-all"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 px-2">
              <div className="text-sm text-gray-600">
                Showing page {page} of {totalPages}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-all"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ContactList;
