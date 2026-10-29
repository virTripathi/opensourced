import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Synchronous ref to prevent stale closures and React re-render cascade loops
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = authToken;

  // Generate request headers with JWT Bearer Token
  const getAuthHeaders = useCallback(
    (extraHeaders: Record<string, string> = {}) => {
      const headers: Record<string, string> = { ...extraHeaders };
      const currentToken = tokenRef.current;
      if (currentToken) {
        headers['Authorization'] = `Bearer ${currentToken}`;
      }
      return headers;
    },
    []
  );

  // Fetch / verify current session with backend (Idempotent query)
  const refreshSession = useCallback(async (tokenToVerify?: string | null) => {
    const activeToken = tokenToVerify !== undefined ? tokenToVerify : tokenRef.current;
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
          // Only update token if server explicitly provided one and it differs
          if (data.token && data.token !== tokenRef.current) {
            tokenRef.current = data.token;
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
      } else if (res.status === 401) {
        // If server reports token is expired or revoked, clear token
        if (activeToken) {
          await storage.remove(STORAGE_KEY_TOKEN);
          await storage.remove(STORAGE_KEY_USER);
          tokenRef.current = null;
          setAuthToken(null);
          setUserProfile(null);
        }
      }
    } catch (err: any) {
      console.warn('Could not verify session with backend:', err.message);
    }
    return null;
  }, []);

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
          tokenRef.current = savedToken;
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
        tokenRef.current = token;
        setAuthToken(token);
        await storage.set(STORAGE_KEY_TOKEN, token);
        await refreshSession(token);
      }
    };

    // Receive token or connection status via BroadcastChannel (cross-context)
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('opensourced_auth_channel');
      bc.onmessage = async (event) => {
        if (event.data?.type === 'OPENSOURCED_AUTH_TOKEN' && event.data.token) {
          const token = event.data.token;
          tokenRef.current = token;
          setAuthToken(token);
          await storage.set(STORAGE_KEY_TOKEN, token);
          await refreshSession(token);
        }
      };
    } catch {}

    // Receive storage event broadcast
    const handleStorage = async (e: StorageEvent) => {
      if (e.key === 'opensourced_auth_broadcast' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data.token) {
            tokenRef.current = data.token;
            setAuthToken(data.token);
            await storage.set(STORAGE_KEY_TOKEN, data.token);
            await refreshSession(data.token);
          }
        } catch {}
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);

    return () => {
      mounted = false;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
      try { bc?.close(); } catch {}
    };
  }, [refreshSession]);

  // Update token & persist
  const saveSession = useCallback(async (token: string, user: UserProfile) => {
    tokenRef.current = token;
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
          const hashIndex = responseUrl.indexOf('#');
          if (hashIndex !== -1) {
            const params = new URLSearchParams(responseUrl.slice(hashIndex + 1));
            const token = params.get('token');
            if (token) {
              tokenRef.current = token;
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

    // Direct browser redirect fallback
    const popup = window.open(`${API_BASE}/api/auth/github`, '_blank');

    return new Promise<{ success: boolean; token?: string; user?: any; error?: string }>((resolve) => {
      let attempts = 0;
      let resolved = false;

      let bc: BroadcastChannel | null = null;
      try {
        bc = new BroadcastChannel('opensourced_auth_channel');
        bc.onmessage = async (ev) => {
          if (ev.data?.type === 'OPENSOURCED_AUTH_TOKEN' && !resolved) {
            resolved = true;
            clearInterval(poll);
            bc?.close();
            if (ev.data.token) {
              tokenRef.current = ev.data.token;
              setAuthToken(ev.data.token);
              await storage.set(STORAGE_KEY_TOKEN, ev.data.token);
            }
            const profile = await refreshSession(ev.data.token);
            try { popup?.close(); } catch {}
            resolve({ success: true, token: ev.data.token, user: profile });
          }
        };
      } catch {}

      const poll = setInterval(async () => {
        if (resolved) return;
        attempts++;
        const profile = await refreshSession();
        if (profile) {
          resolved = true;
          clearInterval(poll);
          bc?.close();
          try { popup?.close(); } catch (e) {}
          resolve({ success: true, user: profile });
        } else if (attempts > 40) {
          resolved = true;
          clearInterval(poll);
          bc?.close();
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

    const currentToken = tokenRef.current;
    const linkParam = currentToken ? `&link_token=${encodeURIComponent(currentToken)}` : '';

    if (typeof chrome !== 'undefined' && chrome.identity?.launchWebAuthFlow) {
      try {
        const redirectUrl = chrome.identity.getRedirectURL('oauth');
        const authUrl = `${API_BASE}/api/auth/google?redirect=${encodeURIComponent(redirectUrl)}${linkParam}`;

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
              tokenRef.current = token;
              setAuthToken(token);
              await storage.set(STORAGE_KEY_TOKEN, token);
              const profile = await refreshSession(token);
              return { success: true, token, user: profile };
            }
          }
        }
      } catch (err: any) {
        console.warn('Google OAuth launchWebAuthFlow:', err.message);
      }
    }

    // Direct browser popup fallback with linkToken so account linking works
    const popup = window.open(`${API_BASE}/api/auth/google?fallback=popup${linkParam}`, '_blank');

    return new Promise<{ success: boolean; token?: string; user?: any; error?: string }>((resolve) => {
      let attempts = 0;
      let resolved = false;

      let bc: BroadcastChannel | null = null;
      try {
        bc = new BroadcastChannel('opensourced_auth_channel');
        bc.onmessage = async (ev) => {
          if (ev.data?.type === 'OPENSOURCED_AUTH_TOKEN' && !resolved) {
            resolved = true;
            clearInterval(poll);
            bc?.close();
            if (ev.data.token) {
              tokenRef.current = ev.data.token;
              setAuthToken(ev.data.token);
              await storage.set(STORAGE_KEY_TOKEN, ev.data.token);
            }
            const profile = await refreshSession(ev.data.token || currentToken);
            try { popup?.close(); } catch {}
            resolve({ success: true, token: ev.data.token || currentToken || undefined, user: profile });
          }
        };
      } catch {}

      const poll = setInterval(async () => {
        if (resolved) return;
        attempts++;
        const profile = await refreshSession(currentToken);
        if (profile?.googleConnected || (profile && !currentToken)) {
          resolved = true;
          clearInterval(poll);
          bc?.close();
          try { popup?.close(); } catch (e) {}
          resolve({ success: true, user: profile });
        } else if (attempts > 30) {
          resolved = true;
          clearInterval(poll);
          bc?.close();
          resolve({ success: false, error: 'Google connection timed out.' });
        }
      }, 1500);
    });
  }, [refreshSession]);

  // Action: Logout and revoke local credentials cleanly
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
    } catch {}

    await storage.remove(STORAGE_KEY_TOKEN);
    await storage.remove(STORAGE_KEY_USER);
    tokenRef.current = null;
    setAuthToken(null);
    setUserProfile(null);
  }, [getAuthHeaders]);

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
