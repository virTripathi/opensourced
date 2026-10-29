import { useState, useEffect, useCallback } from 'react';
import { UserProfile } from '@opensourced/common/types';

import { EXTENSION_CONFIG } from '../config/constants';

const API_BASE = EXTENSION_CONFIG.apiBase;
const STORAGE_KEY_TOKEN = 'opensourced_auth_token';
const STORAGE_KEY_USER = 'opensourced_user_profile';

// Cross-context storage helper (Manifest V3 chrome.storage.local with window.localStorage fallback)
const storage = {
  get: async (key: string): Promise<string | null> => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get(key);
      return data[key] || null;
    }
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  },
  set: async (key: string, value: string): Promise<void> => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [key]: value });
    } else if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  },
  remove: async (key: string): Promise<void> => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(key);
    } else if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
  },
};

export function useAuth() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Generate request headers with JWT Bearer Token
  const getAuthHeaders = useCallback(
    (extraHeaders: Record<string, string> = {}) => {
      const headers: Record<string, string> = { ...extraHeaders };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      return headers;
    },
    [authToken]
  );

  // Fetch / verify current session with backend
  const refreshSession = useCallback(async (tokenToVerify?: string | null) => {
    const activeToken = tokenToVerify !== undefined ? tokenToVerify : authToken;
    try {
      const headers: Record<string, string> = {};
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }

      const res = await fetch(`${API_BASE}/api/auth/session`, {
        headers,
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUserProfile(data.user);
          await storage.set(STORAGE_KEY_USER, JSON.stringify(data.user));
          if (data.token) {
            setAuthToken(data.token);
            await storage.set(STORAGE_KEY_TOKEN, data.token);
          }
          return data.user as UserProfile;
        } else {
          // Explicitly unauthenticated
          setUserProfile(null);
          await storage.remove(STORAGE_KEY_USER);
          return null;
        }
      } else {
        // If server reports token is expired or invalid, clear token
        if (activeToken) {
          await storage.remove(STORAGE_KEY_TOKEN);
          await storage.remove(STORAGE_KEY_USER);
          setAuthToken(null);
          setUserProfile(null);
        }
      }
    } catch (err: any) {
      console.warn('Could not verify session with backend:', err.message);
    }
    return null;
  }, [authToken]);

  // Initial load from secure storage + focus/message synchronization
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const savedToken = await storage.get(STORAGE_KEY_TOKEN);
        const savedUserJson = await storage.get(STORAGE_KEY_USER);

        if (savedToken && savedUserJson) {
          try {
            if (mounted) setUserProfile(JSON.parse(savedUserJson));
          } catch {}
        }

        if (savedToken) {
          if (mounted) setAuthToken(savedToken);
          await refreshSession(savedToken);
        } else {
          // Check backend cookie session in case user authorized via browser
          const sessionUser = await refreshSession();
          if (!sessionUser && mounted) {
            setUserProfile(null);
          }
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initAuth();

    // Auto-sync session when sidepanel/tab gains focus
    const handleFocus = () => {
      refreshSession();
    };

    // Receive token from popup via window.postMessage
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'OPENSOURCED_AUTH_TOKEN' && event.data.token) {
        const token = event.data.token;
        setAuthToken(token);
        await storage.set(STORAGE_KEY_TOKEN, token);
        await refreshSession(token);
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('message', handleMessage);

    return () => {
      mounted = false;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('message', handleMessage);
    };
  }, [refreshSession]);

  // Update token & persist
  const saveSession = useCallback(async (token: string, user: UserProfile) => {
    setAuthToken(token);
    setUserProfile(user);
    await storage.set(STORAGE_KEY_TOKEN, token);
    await storage.set(STORAGE_KEY_USER, JSON.stringify(user));
  }, []);

  // Action: Create an isolated Guest Session
  const loginAsGuest = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/guest`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        await saveSession(data.token, data.user);
        return { success: true, user: data.user, token: data.token };
      }
      throw new Error(`Guest session creation failed (${res.status})`);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [saveSession]);

  // Action: Dev Login / Multi-Tenant Simulation (Alice, Bob, etc.)
  const loginAsDev = useCallback(
    async (username: string, displayName?: string) => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/dev-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username, displayName }),
        });
        if (res.ok) {
          const data = await res.json();
          await saveSession(data.token, data.user);
          return { success: true, user: data.user, token: data.token };
        }
        throw new Error(`Dev login failed (${res.status})`);
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [saveSession]
  );

  // Action: OAuth 2.0 Web Auth Flow (GitHub)
  const loginWithGitHub = useCallback(async () => {
    try {
      const provRes = await fetch(`${API_BASE}/api/auth/providers`).catch(() => null);
      if (provRes && provRes.ok) {
        const provData = await provRes.json();
        if (!provData.github) {
          return { success: false, error: 'GitHub connection is not configured on the server yet.' };
        }
      }
    } catch {}

    if (typeof chrome !== 'undefined' && chrome.identity?.launchWebAuthFlow) {
      try {
        const redirectUrl = chrome.identity.getRedirectURL('oauth');
        const authUrl = `${API_BASE}/api/auth/github?redirect=${encodeURIComponent(redirectUrl)}`;

        const responseUrl = await chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: true,
        });

        if (responseUrl) {
          // Extract token from fragment (#token=...)
          const hashIndex = responseUrl.indexOf('#');
          if (hashIndex !== -1) {
            const params = new URLSearchParams(responseUrl.slice(hashIndex + 1));
            const token = params.get('token');
            if (token) {
              setAuthToken(token);
              await storage.set(STORAGE_KEY_TOKEN, token);
              const profile = await refreshSession(token);
              return { success: true, token, user: profile };
            }
          }
        }
      } catch (err: any) {
        console.warn('Chrome identity web auth flow:', err.message);
      }
    }

    // Direct browser redirect fallback if not running in extension context or if launchWebAuthFlow errored
    const popup = window.open(`${API_BASE}/api/auth/github`, '_blank');

    return new Promise<{ success: boolean; token?: string; user?: any; error?: string }>((resolve) => {
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const profile = await refreshSession();
        if (profile) {
          clearInterval(poll);
          try { popup?.close(); } catch (e) {}
          resolve({ success: true, user: profile });
        } else if (attempts > 40) { // 60 seconds timeout
          clearInterval(poll);
          resolve({ success: false, error: 'Authentication timed out. Please try again.' });
        }
      }, 1500);
    });
  }, [refreshSession]);

  // Action: OAuth 2.0 Web Auth Flow (Google Drive - drive.file scope)
  const loginWithGoogle = useCallback(async () => {
    try {
      const provRes = await fetch(`${API_BASE}/api/auth/providers`).catch(() => null);
      if (provRes && provRes.ok) {
        const provData = await provRes.json();
        if (!provData.google) {
          return { success: false, error: 'Google Drive connection is not configured on the server yet.' };
        }
      }
    } catch {}

    if (typeof chrome !== 'undefined' && chrome.identity?.launchWebAuthFlow) {
      try {
        const redirectUrl = chrome.identity.getRedirectURL('oauth');
        const authUrl = `${API_BASE}/api/auth/google?redirect=${encodeURIComponent(redirectUrl)}`;

        const responseUrl = await chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: true,
        });

        if (responseUrl) {
          const hashIndex = responseUrl.indexOf('#');
          if (hashIndex !== -1) {
            const params = new URLSearchParams(responseUrl.slice(hashIndex + 1));
            const token = params.get('token');
            if (token) {
              setAuthToken(token);
              await storage.set(STORAGE_KEY_TOKEN, token);
              const profile = await refreshSession(token);
              return { success: true, token, user: profile };
            }
          }
        }
      } catch (err: any) {
        console.warn('Google OAuth flow:', err.message);
      }
    }

    const popup = window.open(`${API_BASE}/api/auth/google`, '_blank');

    return new Promise<{ success: boolean; token?: string; user?: any; error?: string }>((resolve) => {
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const profile = await refreshSession();
        if (profile) {
          clearInterval(poll);
          try { popup?.close(); } catch (e) {}
          resolve({ success: true, user: profile });
        } else if (attempts > 40) {
          clearInterval(poll);
          resolve({ success: false, error: 'Google authentication timed out.' });
        }
      }, 1500);
    });
  }, [refreshSession]);

  // Action: Logout and revoke local credentials cleanly
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}

    await storage.remove(STORAGE_KEY_TOKEN);
    await storage.remove(STORAGE_KEY_USER);
    setAuthToken(null);
    setUserProfile(null);
  }, []);

  return {
    authToken,
    userProfile,
    isAuthenticated: Boolean(userProfile && authToken),
    isLoading,
    getAuthHeaders,
    refreshSession,
    loginAsGuest,
    loginAsDev,
    loginWithGitHub,
    loginWithGoogle,
    logout,
  };
}
