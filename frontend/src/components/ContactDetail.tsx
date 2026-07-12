import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface Contact {
  id: string;
  hubspotId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  lifecycleStage: string | null;
  city: string | null;
  country: string | null;
  hsCreatedAt: string | null;
  notes: Note[];
}

interface Note {
  id: string;
  body: string;
  syncedToHubspot: boolean;
  syncAttempts: number;
  createdAt: string;
}

interface ContactDetailProps {
  token: string;
}

const ContactDetail: React.FC<ContactDetailProps> = ({ token }) => {
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

      // Poll notes every 3 seconds to pick up sync status
      const interval = setInterval(() => fetchNotes(id), 3000);
      return () => clearInterval(interval);
    }
  }, [id, token]);

  const fetchContact = async (contactId: string) => {
    try {
      const response = await fetch(
        `https://hubspot-sync-backend.vercel.app/api/contacts/${contactId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (data.success) {
        setContact(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch contact:', error);
      toast.error('Failed to load contact');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNotes = async (contactId: string) => {
    try {
      const response = await fetch(
        `https://hubspot-sync-backend.vercel.app/api/contacts/${contactId}/notes`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (data.success) {
        setNotes(data.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch notes:', error);
    }
  };

  const handleAddNote = async () => {
    if (!id || !newNote.trim()) return;

    setIsAddingNote(true);
    try {
      const response = await fetch(
        `https://hubspot-sync-backend.vercel.app/api/contacts/${id}/notes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ body: newNote }),
        }
      );

      const data = await response.json();
      if (data.success) {
        setNotes((prev) => [data.data, ...prev]);
        setNewNote('');
        toast.success('Note added and syncing to HubSpot');
      }
    } catch (error) {
      console.error('Failed to add note:', error);
      toast.error('Failed to add note');
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const response = await fetch(
        `https://hubspot-sync-backend.vercel.app/api/notes/${noteId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        toast.success('Note deleted');
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
      toast.error('Failed to delete note');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="text-center">
          <div className="spinner w-12 h-12 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading contact...</p>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Contact not found</h3>
        <button onClick={() => navigate('/')} className="mt-4 text-orange-600 hover:text-orange-700">
          Back to contacts
        </button>
      </div>
    );
  }

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';

  return (
    <div className="animate-fade-in">
      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-6 group"
      >
        <svg className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to contacts
      </button>

      {/* Contact Header */}
      <div className="card p-8 mb-6">
        <div className="flex items-start space-x-6">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-orange-500 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-orange-200">
            {fullName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{fullName}</h1>
            {contact.jobTitle && contact.company && (
              <p className="text-lg text-gray-600">
                {contact.jobTitle} at {contact.company}
              </p>
            )}
            {contact.lifecycleStage && (
              <span className="badge badge-info mt-3">
                {contact.lifecycleStage}
              </span>
            )}
          </div>
        </div>

        {/* Contact Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8 pt-8 border-t border-gray-200">
          {contact.email && (
            <div>
              <dt className="text-sm font-medium text-gray-500 mb-1">Email</dt>
              <dd>
                <a href={`mailto:${contact.email}`} className="text-orange-600 hover:text-orange-700 font-medium">
                  {contact.email}
                </a>
              </dd>
            </div>
          )}
          {contact.phone && (
            <div>
              <dt className="text-sm font-medium text-gray-500 mb-1">Phone</dt>
              <dd>
                <a href={`tel:${contact.phone}`} className="text-orange-600 hover:text-orange-700 font-medium">
                  {contact.phone}
                </a>
              </dd>
            </div>
          )}
          {contact.company && (
            <div>
              <dt className="text-sm font-medium text-gray-500 mb-1">Company</dt>
              <dd className="text-gray-900 font-medium">{contact.company}</dd>
            </div>
          )}
          {contact.city && (
            <div>
              <dt className="text-sm font-medium text-gray-500 mb-1">City</dt>
              <dd className="text-gray-900 font-medium">{contact.city}</dd>
            </div>
          )}
          {contact.country && (
            <div>
              <dt className="text-sm font-medium text-gray-500 mb-1">Country</dt>
              <dd className="text-gray-900 font-medium">{contact.country}</dd>
            </div>
          )}
        </div>
      </div>

      {/* Notes Section */}
      <div className="card p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Notes</h2>

        {/* Add Note Form */}
        <div className="mb-8">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note about this contact..."
            rows={4}
            className="input resize-none"
          />
          <div className="flex justify-between items-center mt-3">
            <p className="text-sm text-gray-500">
              Notes are automatically synced to HubSpot
            </p>
            <button
              onClick={handleAddNote}
              disabled={!newNote.trim() || isAddingNote}
              className="btn-primary inline-flex items-center"
            >
              {isAddingNote ? (
                <>
                  <div className="spinner w-4 h-4 mr-2 border-2 border-white border-t-transparent"></div>
                  Adding...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Note
                </>
              )}
            </button>
          </div>
        </div>

        {/* Notes List */}
        {notes.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No notes yet</h3>
            <p className="text-gray-600">Add your first note about this contact</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note, index) => (
              <div
                key={note.id}
                className="p-6 bg-gray-50 rounded-xl animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex justify-between items-start">
                  <p className="text-gray-900 whitespace-pre-wrap flex-1">{note.body}</p>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="ml-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                  <span className="text-sm text-gray-500">
                    {new Date(note.createdAt).toLocaleString()}
                  </span>
                  <div className="flex items-center">
                    {note.syncedToHubspot ? (
                      <span className="badge badge-success">
                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Synced to HubSpot
                      </span>
                    ) : (
                      <span className="badge badge-warning">
                        <svg className="w-3 h-3 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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
