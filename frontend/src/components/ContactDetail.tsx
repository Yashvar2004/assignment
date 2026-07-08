import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { contactsApi, notesApi } from '../services/api';
import { Contact, Note } from '../types';
import toast from 'react-hot-toast';

const ContactDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  useEffect(() => {
    if (id) {
      fetchContact(id);
      fetchNotes(id);
    }
  }, [id]);

  const fetchContact = async (contactId: string) => {
    try {
      const data = await contactsApi.getContactById(contactId);
      setContact(data);
    } catch (error) {
      console.error('Failed to fetch contact:', error);
      toast.error('Failed to load contact');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNotes = async (contactId: string) => {
    try {
      const result = await notesApi.getNotes(contactId, { limit: 50 });
      setNotes(result.data);
    } catch (error) {
      console.error('Failed to fetch notes:', error);
    }
  };

  const handleAddNote = async () => {
    if (!id || !newNote.trim()) return;

    setIsAddingNote(true);
    try {
      const note = await notesApi.createNote(id, newNote.trim());
      setNotes((prev) => [note, ...prev]);
      setNewNote('');
      toast.success('Note added and syncing to HubSpot');
    } catch (error) {
      console.error('Failed to add note:', error);
      toast.error('Failed to add note');
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await notesApi.deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success('Note deleted');
    } catch (error) {
      console.error('Failed to delete note:', error);
      toast.error('Failed to delete note');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <svg
          className="animate-spin h-8 w-8 text-orange-500"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Contact not found</h3>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-orange-600 hover:text-orange-700"
        >
          Back to contacts
        </button>
      </div>
    );
  }

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
      >
        <svg
          className="w-5 h-5 mr-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to contacts
      </button>

      {/* Contact header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start">
          <div className="h-16 w-16 flex-shrink-0 bg-orange-100 rounded-full flex items-center justify-center">
            <span className="text-2xl text-orange-600 font-medium">
              {fullName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="ml-6 flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
            {contact.jobTitle && contact.company && (
              <p className="text-gray-600">
                {contact.jobTitle} at {contact.company}
              </p>
            )}
            {contact.lifecycleStage && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-2">
                {contact.lifecycleStage}
              </span>
            )}
          </div>
        </div>

        {/* Contact details grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-200">
          {contact.email && (
            <div>
              <dt className="text-sm text-gray-500">Email</dt>
              <dd className="text-sm text-gray-900">
                <a
                  href={`mailto:${contact.email}`}
                  className="text-orange-600 hover:underline"
                >
                  {contact.email}
                </a>
              </dd>
            </div>
          )}
          {contact.phone && (
            <div>
              <dt className="text-sm text-gray-500">Phone</dt>
              <dd className="text-sm text-gray-900">
                <a
                  href={`tel:${contact.phone}`}
                  className="text-orange-600 hover:underline"
                >
                  {contact.phone}
                </a>
              </dd>
            </div>
          )}
          {contact.company && (
            <div>
              <dt className="text-sm text-gray-500">Company</dt>
              <dd className="text-sm text-gray-900">{contact.company}</dd>
            </div>
          )}
          {contact.city && (
            <div>
              <dt className="text-sm text-gray-500">City</dt>
              <dd className="text-sm text-gray-900">{contact.city}</dd>
            </div>
          )}
          {contact.country && (
            <div>
              <dt className="text-sm text-gray-500">Country</dt>
              <dd className="text-sm text-gray-900">{contact.country}</dd>
            </div>
          )}
          {contact.hsCreatedAt && (
            <div>
              <dt className="text-sm text-gray-500">Created in HubSpot</dt>
              <dd className="text-sm text-gray-900">
                {new Date(contact.hsCreatedAt).toLocaleDateString()}
              </dd>
            </div>
          )}
        </div>
      </div>

      {/* Notes section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>

        {/* Add note form */}
        <div className="mb-6">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note about this contact..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
          />
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs text-gray-500">
              Notes are synced to HubSpot automatically
            </p>
            <button
              onClick={handleAddNote}
              disabled={!newNote.trim() || isAddingNote}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAddingNote ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Adding...
                </>
              ) : (
                'Add Note'
              )}
            </button>
          </div>
        </div>

        {/* Notes list */}
        {notes.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No notes</h3>
            <p className="mt-1 text-sm text-gray-500">
              Add your first note about this contact
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <div
                key={note.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex justify-between items-start">
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">
                    {note.body}
                  </p>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="ml-4 text-gray-400 hover:text-red-500"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-500">
                    {new Date(note.createdAt).toLocaleString()}
                  </span>
                  <div className="flex items-center">
                    {note.syncedToHubspot ? (
                      <span className="inline-flex items-center text-xs text-green-600">
                        <svg
                          className="w-3 h-3 mr-1"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Synced to HubSpot
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs text-yellow-600">
                        <svg
                          className="animate-spin w-3 h-3 mr-1"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Syncing...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactDetail;
