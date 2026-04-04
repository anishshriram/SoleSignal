// context/AuthContext.tsx — Authentication state management.
//
// Provides a React context that stores the current user's JWT and decoded identity
// (user_id, email) for the entire app. All screens access this via the `useAuth()` hook.
//
// How login/logout works:
//   Login:  Screen calls `setAuth(token, user)` → token written to iOS Keychain →
//           React state updated → App.tsx sees non-null user → navigates to HomeScreen
//   Logout: Screen calls `clearAuth()` → Keychain cleared → React state nulled →
//           App.tsx sees null user → navigates to LoginScreen
//
// On app restart (cold launch):
//   AuthProvider reads the Keychain in its useEffect on mount. If a stored token is
//   found, user state is restored without requiring re-login (single sign-on behavior).
//   `loading` is true during this check — App.tsx renders nothing until it resolves.
//
// The Keychain (react-native-keychain) stores credentials in the iOS Keychain,
// which is encrypted and persists across app restarts. We use:
//   - `username` field: JSON-stringified { user_id, email } (the identity)
//   - `password` field: the raw JWT string (the credential)

import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Keychain from 'react-native-keychain';

// Shape of the decoded JWT payload / user identity stored in context
interface AuthUser {
  user_id: number; // matches the `id` primary key in the users DB table
  email: string;
}

// Full shape of the context value — what any consumer of useAuth() receives
interface AuthContextValue {
  user: AuthUser | null;   // null = not logged in, non-null = logged in
  token: string | null;    // the raw JWT string (used by the axios interceptor in api.ts)
  setAuth: (token: string, user: AuthUser) => Promise<void>; // called after login
  clearAuth: () => Promise<void>;  // called on logout
  loading: boolean; // true while checking Keychain on startup — prevents flash of wrong screen
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // loading starts true — we don't know if the user is logged in until Keychain is read
  const [loading, setLoading] = useState(true);

  // On mount: check the Keychain for a previously stored session.
  // This runs once when the app first loads and allows users to stay logged in
  // across app restarts without re-entering their credentials.
  useEffect(() => {
    (async () => {
      try {
        const credentials = await Keychain.getGenericPassword();
        if (credentials) {
          // `username` holds the JSON-stringified AuthUser, `password` holds the JWT
          const stored = JSON.parse(credentials.username);
          setUser(stored);
          setToken(credentials.password);
        }
        // If no credentials found, user and token remain null → LoginScreen is shown
      } catch {
        // Keychain read failed (e.g. first install, simulator reset) — start fresh
      } finally {
        // Always set loading to false so App.tsx can render the correct screen
        setLoading(false);
      }
    })();
  }, []);

  // setAuth — called by LoginScreen after a successful POST /users/login response.
  // Persists the token to Keychain so it survives app restarts, then updates React state.
  const setAuth = async (newToken: string, newUser: AuthUser) => {
    // username = identity (JSON), password = JWT — Keychain's naming is fixed, we repurpose the fields
    await Keychain.setGenericPassword(JSON.stringify(newUser), newToken);
    setToken(newToken);
    setUser(newUser);
    // After this, App.tsx sees non-null user and navigates to the authenticated screen set
  };

  // clearAuth — called by HomeScreen on logout.
  // Removes credentials from Keychain (the next Keychain.getGenericPassword() returns false),
  // then nulls the React state so App.tsx navigates back to the auth stack.
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

// useAuth — the hook all screens use to read or update auth state.
// Must be called inside a component that is a descendant of AuthProvider.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
