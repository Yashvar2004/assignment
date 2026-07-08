import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import ConnectButton from './components/ConnectButton';
import ContactList from './components/ContactList';
import ContactDetail from './components/ContactDetail';
import SyncStatus from './components/SyncStatus';
import AuthCallback from './pages/AuthCallback';

// Protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, connectionStatus, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-orange-500 mx-auto"
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
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !connectionStatus?.connected) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Main app content
const AppContent: React.FC = () => {
  const { isAuthenticated, connectionStatus, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          {/* Auth callback route */}
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Home route - shows connect button or contacts */}
          <Route
            path="/"
            element={
              isLoading ? (
                <div className="min-h-[60vh] flex items-center justify-center">
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
              ) : !isAuthenticated || !connectionStatus?.connected ? (
                <ConnectButton />
              ) : (
                <ContactList />
              )
            }
          />

          {/* Protected routes */}
          <Route
            path="/contacts/:id"
            element={
              <ProtectedRoute>
                <ContactDetail />
              </ProtectedRoute>
            }
          />

          <Route
            path="/sync-status"
            element={
              <ProtectedRoute>
                <SyncStatus />
              </ProtectedRoute>
            }
          />

          {/* Catch all route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              HubSpot Sync - Contact Management Integration
            </p>
            <p className="text-sm text-gray-400">
              Built with React, Node.js, and HubSpot API
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

// Root App component with providers
const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              iconTheme: {
                primary: '#10B981',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </AuthProvider>
    </Router>
  );
};

export default App;
