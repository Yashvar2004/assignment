import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/api';
import type { ConnectionStatus } from '../types';

interface AuthContextType {
  isAuthenticated: boolean;
  connectionStatus: ConnectionStatus | null;
  isLoading: boolean;
  checkConnection: () => Promise<void>;
  connectHubSpot: () => Promise<void>;
  connectWithPat: () => Promise<void>;
  disconnect: () => Promise<void>;
  setToken: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkConnection = useCallback(async () => {
    try {
      const token = localStorage.getItem('hubspot_sync_token');
      if (!token) {
        setIsAuthenticated(false);
        setConnectionStatus({ connected: false });
        setIsLoading(false);
        return;
      }

      setIsAuthenticated(true);
      const status = await authApi.checkConnection();
      setConnectionStatus(status);
    } catch (error) {
      console.error('Failed to check connection:', error);
      setConnectionStatus({ connected: false });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const connectHubSpot = async () => {
    try {
      const url = await authApi.getAuthUrl();
      window.location.href = url;
    } catch (error) {
      console.error('Failed to get auth URL:', error);
      throw error;
    }
  };

  const connectWithPat = async () => {
    try {
      const result = await authApi.connectWithPat();
      setToken(result.token);
      await checkConnection();
    } catch (error) {
      console.error('Failed to connect with PAT:', error);
      throw error;
    }
  };

  const disconnect = async () => {
    try {
      await authApi.disconnect();
      setConnectionStatus({ connected: false });
    } catch (error) {
      console.error('Failed to disconnect:', error);
      throw error;
    }
  };

  const setToken = (token: string) => {
    localStorage.setItem('hubspot_sync_token', token);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('hubspot_sync_token');
    setIsAuthenticated(false);
    setConnectionStatus({ connected: false });
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        connectionStatus,
        isLoading,
        checkConnection,
        connectHubSpot,
        connectWithPat,
        disconnect,
        setToken,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
