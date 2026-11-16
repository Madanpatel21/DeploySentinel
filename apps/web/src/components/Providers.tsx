'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  organizationId: string;
  organizationName: string;
  plan: string;
}

interface AuthCtx {
  token: string | null;
  user: SessionUser | null;
  loading: boolean;
  setSession: (token: string, user: SessionUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>({
  token: null,
  user: null,
  loading: true,
  setSession: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10000 } },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('rg_token');
    const savedUser = localStorage.getItem('rg_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        setUser(JSON.parse(savedUser) as SessionUser);
      } catch {
        localStorage.removeItem('rg_user');
      }
    }
    setLoading(false);
  }, []);

  const setSession = (newToken: string, newUser: SessionUser) => {
    localStorage.setItem('rg_token', newToken);
    localStorage.setItem('rg_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('rg_token');
    localStorage.removeItem('rg_user');
    setToken(null);
    setUser(null);
    queryClient.clear();
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ token, user, loading, setSession, logout }}>
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
