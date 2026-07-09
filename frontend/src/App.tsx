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
          <div className="spinner w-12 h-12 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
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
                  <div className="text-center">
                    <div className="spinner w-12 h-12 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading...</p>
                  </div>
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
      <footer className="bg-white/80 backdrop-blur-md border-t border-gray-200/50 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-500 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="font-semibold text-gray-900">HubSpot Sync</span>
            </div>
            <p className="text-sm text-gray-500">
              Contact Management Integration • Built with React, Node.js & HubSpot API
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
