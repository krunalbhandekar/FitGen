import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, AUTH_EXPIRED_EVENT, tokenStore } from '../lib/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  // `loading` covers the initial session rehydration only, so the router can
  // hold protected routes until we know whether a token is valid.
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState(null);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  // Rehydrate on first mount.
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      if (!tokenStore.get()) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get('/auth/me');
        if (!cancelled) setUser(data.user);
      } catch {
        // Interceptor already cleared an invalid token.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 anywhere in the app drops us back to a signed-out state.
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setError('Your session expired. Please sign in again.');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  /** Exchanges a Google ID token for a FitGen session. */
  const signInWithGoogle = useCallback(async (credential) => {
    setSigningIn(true);
    setError(null);
    try {
      const { data } = await api.post('/auth/google', { credential });
      tokenStore.set(data.token);
      setUser(data.user);
      return { isNewUser: data.isNewUser, user: data.user };
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSigningIn(false);
    }
  }, []);

  /**
   * Replaces the cached user after a profile write, so views depending on
   * `onboardingCompleted` or `planRegeneration` update without a refetch.
   */
  const updateUser = useCallback((nextUser) => {
    setUser((current) => ({ ...current, ...nextUser }));
  }, []);

  /** Re-reads the user from the server. */
  const refreshUser = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Signing out locally matters more than the server acknowledging it.
    }
    clearSession();
    setError(null);
  }, [clearSession]);

  /**
   * The name to render anywhere a user is addressed.
   *
   * The profile's `fullName` is what the user chose, so it wins; Google's name
   * is the fallback before onboarding. `||` rather than `??` deliberately — an
   * empty or whitespace-only string must fall through, not render as a blank.
   */
  const displayName = user?.profile?.fullName?.trim() || user?.name || '';

  const value = useMemo(
    () => ({
      user,
      loading,
      signingIn,
      error,
      setError,
      displayName,
      firstName: displayName.split(' ')[0] || 'there',
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      signInWithGoogle,
      signOut,
      updateUser,
      refreshUser,
    }),
    [
      user,
      loading,
      signingIn,
      error,
      displayName,
      signInWithGoogle,
      signOut,
      updateUser,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return context;
};
