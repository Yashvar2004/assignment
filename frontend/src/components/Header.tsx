import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

const Header: React.FC = () => {
  const { isAuthenticated, connectionStatus, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div
            className="flex items-center cursor-pointer"
            onClick={() => navigate('/')}
          >
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <span className="ml-2 text-xl font-semibold text-gray-900">
              HubSpot Sync
            </span>
          </div>

          {/* Navigation */}
          {isAuthenticated && connectionStatus?.connected && (
            <nav className="hidden md:flex space-x-8">
              <button
                onClick={() => navigate('/')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === '/'
                    ? 'bg-orange-50 text-orange-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Contacts
              </button>
              <button
                onClick={() => navigate('/sync-status')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === '/sync-status'
                    ? 'bg-orange-50 text-orange-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Sync Status
              </button>
            </nav>
          )}

          {/* Right side */}
          <div className="flex items-center space-x-4">
            {isAuthenticated && (
              <>
                {connectionStatus?.connected && (
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                    <span className="text-sm text-gray-600">
                      {connectionStatus.portalName || 'Connected'}
                    </span>
                  </div>
                )}
                <button
                  onClick={logout}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
