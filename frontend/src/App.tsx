import React, { useState, useEffect } from 'react';
import AuthForm from './components/AuthForm';
import ConnectHubSpot from './components/ConnectHubSpot';
import ContactList from './components/ContactList';
import ContactDetail from './components/ContactDetail';
import TokenDashboard from './components/TokenDashboard';
import Header from './components/Header';
import LoadingSpinner from './components/LoadingSpinner';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

interface User {
  id: string;
  email: string;
  name: string;
}

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('hubspot_sync_token'));
  const [user, setUser] = useState<User | null>(null);
  const [hubspotConnected, setHubspotConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch('https://hubspot-sync-backend.vercel.app/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await response.json();

        if (data.success) {
          setUser(data.data);
          setHubspotConnected(!!data.data.hubspotPortalId);
        } else {
          // Invalid token
          localStorage.removeItem('hubspot_sync_token');
          setToken(null);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [token]);

  const handleLogin = (newToken: string, newUser: User) => {
    localStorage.setItem('hubspot_sync_token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('hubspot_sync_token');
    setToken(null);
    setUser(null);
    setHubspotConnected(false);
  };

  const handleHubspotConnected = () => {
    setHubspotConnected(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100">
        <LoadingSpinner message="Loading..." size="large" />
      </div>
    );
  }

  // Not logged in - show auth form
  if (!token || !user) {
    return <AuthForm onLogin={handleLogin} />;
  }

  // Logged in but HubSpot not connected
  if (!hubspotConnected) {
    return <ConnectHubSpot onConnected={handleHubspotConnected} token={token} />;
  }

  // Fully authenticated and connected
  return (
    <Router>
      <div className="App min-h-screen bg-gray-50">
        <Header user={user} onLogout={handleLogout} />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<ContactList token={token} />} />
            <Route path="/contacts/:id" element={<ContactDetail token={token} />} />
            <Route path="/dashboard" element={<TokenDashboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <footer className="bg-white border-t border-gray-200 py-6 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm text-gray-500">
              HubSpot Sync - Contact Management Integration
            </p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
