import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Keychain from 'react-native-keychain';

interface AuthUser {
  user_id: number;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  setAuth: (token: string, user: AuthUser) => Promise<void>;
  clearAuth: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const credentials = await Keychain.getGenericPassword();
        if (credentials) {
          const stored = JSON.parse(credentials.username);
          setUser(stored);
          setToken(credentials.password);
        }
      } catch {
        // No stored credentials
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setAuth = async (newToken: string, newUser: AuthUser) => {
    await Keychain.setGenericPassword(JSON.stringify(newUser), newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const clearAuth = async () => {
    await Keychain.resetGenericPassword();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, setAuth, clearAuth, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
