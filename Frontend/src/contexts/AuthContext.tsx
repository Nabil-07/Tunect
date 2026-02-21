/**
 * AuthContext.tsx
 * 
 * Manages user authentication state across the application.
 * 
 * TODO: Next Release - Multi-Account Switching Feature
 * The following functionality has been commented out and deferred to next release:
 * - switchAccount(): Switch between multiple logged-in accounts
 * - addAccount(): Add additional accounts without logging out
 * - removeAccount(): Remove saved accounts from storage
 * - accounts state: List of all stored accounts
 * - accountManager integration: Persistent multi-account storage
 * 
 * Related files to uncomment for multi-account feature:
 * - Frontend/src/services/accountManager.ts
 * - Frontend/src/lib/auth.ts (getAccessToken, setTokens, clearTokens)
 * - Frontend/src/components/Navbar.tsx (Account switcher UI)
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { me as fetchMe, logout as doLogout } from '../services/authService';
import { readToken, setAuthHeader, getTimeLeftSec, refreshAccessToken, writeToken, writeRefreshToken } from '../lib/apiClient';
// Note: decryptField from '../utils/decryption' is used in the commented-out switchAccount
// multi-account code below. Import it when uncommenting that section.
import { getKycStatus, getMyProfile } from '../services/tutorService';
// TODO: Next Release - Multi-account imports
// import { getAccessToken, setTokens, clearTokens } from '../lib/auth';
// import { accountManager, type StoredAccount } from '../services/accountManager';
// import api from '../lib/apiClient';

type RoleApi = 'STUDENT' | 'TUTOR' | 'ADMIN';
type User = {
  id: string;
  email: string;
  role?: RoleApi | string;
  name?: string;
  avatarUrl?: string | null;
  isDirector?: boolean;
  isBanned?: boolean;
  bannedScope?: string | null;
  bannedAt?: string | null;
  banReason?: string | null;
  piiStrikes?: number;
  piiMaxStrikes?: number;
  messagingBlocked?: boolean;
  terms?: {
    currentVersion?: number;
    acceptedForCurrentRole?: boolean;
    student?: { accepted: boolean; version: number | null; acceptedAt: string | null };
    tutor?: { accepted: boolean; version: number | null; acceptedAt: string | null };
  };
  student?: { id: string } | null;
  tutor?: { id: string } | null;
} | null;

type AuthCtx = {
  user: User;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean | null;
  setUser: React.Dispatch<React.SetStateAction<User>>;
  logout: () => void;
  // TODO: Next Release - Multi-account methods
  // accounts: StoredAccount[];
  // switchAccount: (accountId: string) => Promise<void>;
  // addAccount: (user: any, accessToken: string, refreshToken: string) => void;
  // removeAccount: (accountId: string) => void;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

function hasProfile(u: any): boolean {
  if (!u) return false;
  const hasStudent = !!u.student?.id;
  const hasTutor = !!u.tutor?.id;
  const hasRole = u.role === 'STUDENT' || u.role === 'TUTOR' || u.role === 'ADMIN';
  return hasStudent || hasTutor || hasRole;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readToken());
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();
  const loc = useLocation();
  const [idleOpen, setIdleOpen] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(30);
  const [blocked, setBlocked] = useState<{ active: boolean; strikes: number; max: number }>({ active: false, strikes: 0, max: 3 });
  const [kycPrompt, setKycPrompt] = useState<{ show: boolean; status?: string }>({ show: false });

  useEffect(() => {
    if (!user) {
      setBlocked((prev) => ({ ...prev, active: false }));
      setKycPrompt({ show: false });
      return;
    }
    const strikes = user.piiStrikes ?? 0;
    const max = user.piiMaxStrikes ?? 3;
    const active = !!user.messagingBlocked || strikes >= max;
    setBlocked({ active, strikes, max });
  }, [user]);

  // Prompt tutors to finish KYC if they are not approved yet
  useEffect(() => {
    let alive = true;

    const roleUpper = (user?.role || '').toString().toUpperCase();
    const shouldCheck = roleUpper === 'TUTOR';
    const tutorTermsAccepted = !!user?.terms?.tutor?.accepted;
    const path = loc?.pathname || '';
    const onKycPage = path.startsWith('/tutor/kyc') || path.startsWith('/become-tutor');

    if (!shouldCheck || onKycPage || !tutorTermsAccepted) {
      setKycPrompt((prev) => (prev.show ? { show: false, status: prev.status } : prev));
      return () => { alive = false; };
    }

    (async () => {
      try {
        // Short-circuit if tutor profile already approved
        const profile = await getMyProfile();
        const tutorStatus = (profile?.status || profile?.tutor?.status || '').toString().toUpperCase();
        if (tutorStatus === 'APPROVED') {
          setKycPrompt({ show: false, status: 'approved' });
          return;
        }

        const res = await getKycStatus();
        if (!alive) return;
        const status = res?.status || 'none';
        if (status === 'approved' || status === 'submitted' || status === 'under_review') {
          setKycPrompt({ show: false, status });
        } else {
          setKycPrompt({ show: true, status });
        }
      } catch {
        if (!alive) return;
        // Conservative: show prompt if status lookup fails
        setKycPrompt((prev) => ({ show: true, status: prev.status || 'unknown' }));
      }
    })();

    return () => {
      alive = false;
    };
  }, [user, user?.terms?.tutor?.accepted, loc?.pathname]);
  const lastActivityRef = useRef<number>(Date.now());
  const idleTimerRef = useRef<number | null>(null);
  const warnTimerRef = useRef<number | null>(null);
  const hasNavigated = useRef(false); // ✅ bounce guard
  const isSwitchingAccount = useRef(false); // 🔄 account switch guard

  // Initial hydrate
  useEffect(() => {
    let alive = true;
    const t = readToken();
    setToken(t);
    setAuthHeader(t || null);

    async function hydrate() {
      try {
        if (!t) return;
        const u = await fetchMe();
        const resolved = (u as any)?.user ?? u ?? null;
        if (alive) {
          setUser(resolved);
          if (resolved?.messagingBlocked) {
            setBlocked({
              active: true,
              strikes: resolved.piiStrikes ?? 0,
              max: resolved.piiMaxStrikes ?? 3,
            });
          } else {
            setBlocked({ active: false, strikes: resolved?.piiStrikes ?? 0, max: resolved?.piiMaxStrikes ?? 3 });
          }
          // Reset navigation guard when user is successfully loaded
          if (resolved && hasProfile(resolved)) {
            hasNavigated.current = false;
          }
        }
      } catch (err: any) {
        console.error('❌ Failed to fetch user on hydration:', err?.response?.status, err?.response?.data?.message);
        // If token expired, try refresh before giving up
        if (err?.response?.status === 401 || err?.response?.data?.message === 'jwt expired') {
          console.log('⚠️ Token expired on mount, attempting refresh...');
          try {
            const newToken = await refreshAccessToken();
            if (newToken && alive) {
              console.log('✅ Refresh successful, retrying user fetch');
              const u = await fetchMe();
              const resolved = (u as any)?.user ?? u ?? null;
              if (alive) setUser(resolved);
            } else {
              console.log('❌ Refresh failed, clearing session');
              if (alive) {
                setUser(null);
                setToken(null);
                writeToken(null);
                writeRefreshToken(null);
              }
            }
          } catch (refreshErr) {
            console.error('❌ Refresh failed:', refreshErr);
            if (alive) {
              setUser(null);
              setToken(null);
              writeToken(null);
              writeRefreshToken(null);
            }
          }
        } else if (err?.response?.status >= 500 || err?.code === 'ERR_NETWORK') {
          // Server error or network error - don't clear user, keep existing state
          console.log('⚠️ Server/Network error during hydrate, keeping existing state');
          // Don't clear user on server errors
        } else {
          // Other errors (404, etc.) - clear user
          if (alive) {
            setUser(null);
            writeToken(null);
            writeRefreshToken(null);
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    if (t) void hydrate();
    else setLoading(false);

    return () => {
      alive = false;
    };
  }, []);

  // 🧠 Redirect to /choose-role if logged in but no profile
  useEffect(() => {
    // Don't redirect while loading, switching accounts, or if no token
    if (loading || isSwitchingAccount.current || !token) return;
    
    // Don't redirect if we already navigated
    if (hasNavigated.current) return;

    const path = loc.pathname || '';
    const onChoose = path.startsWith('/choose-role');
    const onAuth = path.startsWith('/login') || path.startsWith('/oauth');
    
    // Don't redirect if already on choose-role or auth pages
    if (onChoose || onAuth) return;

    // Only redirect if we have a token but user is explicitly null or missing profile
    // Wait for user to be loaded (not just undefined)
    if (user === null) {
      // Token exists but user is null - likely invalid token
      return;
    }

    // If user exists but has no profile, redirect to choose-role
    if (user && !hasProfile(user)) {
      console.log('⚠️ User has no profile, redirecting to choose-role');
      hasNavigated.current = true;
      nav('/choose-role', { replace: true });
    } else if (user && hasProfile(user)) {
      // User has profile, mark as navigated so we don't redirect again
      hasNavigated.current = false;
    }
  }, [loading, token, user, loc.pathname, nav]);

  // Token refresh logic
  useEffect(() => {
    let alive = true;

    async function rehydrate() {
      const t = readToken();
      setToken(t);
      if (!t) {
        setUser(null);
        setAuthHeader(null);
        return;
      }
      setAuthHeader(t);
      try {
        const u = await fetchMe();
        if (alive) setUser((u as any)?.user ?? u ?? null);
      } catch {
        if (alive) setUser(null);
      }
    }

    function onRefreshed(event: Event) {
      const customEvent = event as CustomEvent;
      const userData = customEvent.detail?.user;
      
      // Update token state FIRST before updating user to avoid race conditions
      const freshToken = readToken();
      if (freshToken && alive) {
        setToken(freshToken);
        setAuthHeader(freshToken);
      }
      
      // ALWAYS fetch fresh user data after token refresh to ensure we have decrypted data
      // Don't trust userData from refresh event as it might have encrypted email
      // This prevents showing stale encrypted email when token expires
      if (freshToken) {
        (async () => {
          try {
            const u = await fetchMe();
            const resolved = (u as any)?.user ?? u ?? null;
            if (alive) {
              setUser(resolved);
              if (resolved && hasProfile(resolved)) {
                hasNavigated.current = false;
              }
            }
          } catch (err) {
            console.error('❌ Failed to fetch user after token refresh:', err);
            // If fetch fails but we have userData from event, use it as fallback
            // (though it might have encrypted email, it's better than nothing)
            if (userData && alive) {
              setUser(userData);
              if (hasProfile(userData)) {
                hasNavigated.current = false;
              }
            }
          }
        })();
      }
    }

    function onUnauthorized() {
      // Only clear if we actually have a session to clear
      const hasSession = readToken() !== null || user !== null;
      if (!hasSession) {
        console.log('⚠️ onUnauthorized: No session to clear, ignoring');
        return;
      }
      
      console.log('🚨 Auth session invalidated - clearing tokens and redirecting');
      // Reset navigation guard to allow fresh login
      hasNavigated.current = false;
      setToken(null);
      setUser(null);
      setAuthHeader(null);
      localStorage.removeItem('role');
      // Clear all token storage
      writeToken(null);
      writeRefreshToken(null);
      // Redirect to login if not already there
      const currentPath = window.location.pathname;
      if (!currentPath.startsWith('/login') && !currentPath.startsWith('/signup')) {
        nav('/login', { replace: true });
      }
    }

    function onTokenUpdated() {
      void rehydrate();
    }

    function onStorage(e: StorageEvent) {
      if (!e.key || !['tunect_access_token', 'accessToken', 'token'].includes(e.key)) return;
      void rehydrate();
    }

    window.addEventListener('auth:refreshed', onRefreshed);
    window.addEventListener('auth:unauthorized', onUnauthorized);
    window.addEventListener('auth:token_updated', onTokenUpdated);
    window.addEventListener('storage', onStorage);

    return () => {
      alive = false;
      window.removeEventListener('auth:refreshed', onRefreshed);
      window.removeEventListener('auth:unauthorized', onUnauthorized);
      window.removeEventListener('auth:token_updated', onTokenUpdated);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Idle session watchdog: warn after 30m idle, auto-logout after 30s
  useEffect(() => {
    const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    const WARNING_SECONDS = 30;

    const onActivity = () => {
      lastActivityRef.current = Date.now();
      if (idleOpen) {
        setIdleOpen(false);
        setIdleCountdown(WARNING_SECONDS);
        if (warnTimerRef.current) window.clearInterval(warnTimerRef.current);
      }
    };

    const onVisibility = () => { if (!document.hidden) onActivity(); };

    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach((evt) =>
      window.addEventListener(evt, onActivity, { passive: true })
    );
    document.addEventListener('visibilitychange', onVisibility);

    idleTimerRef.current = window.setInterval(() => {
      if (idleOpen) return;
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor >= IDLE_TIMEOUT_MS) {
        setIdleOpen(true);
        setIdleCountdown(WARNING_SECONDS);
        if (warnTimerRef.current) window.clearInterval(warnTimerRef.current);
        warnTimerRef.current = window.setInterval(() => {
          setIdleCountdown((s) => {
            if (s <= 1) {
              if (warnTimerRef.current) window.clearInterval(warnTimerRef.current);
              doLogout();
              setAuthHeader(null);
              setToken(null);
              setUser(null);
              localStorage.removeItem('role');
              nav('/login', { replace: true });
              return 0;
            }
            return s - 1;
          });
        }, 1000);
      }
    }, 15000);

    return () => {
      ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach((evt) =>
        window.removeEventListener(evt, onActivity)
      );
      document.removeEventListener('visibilitychange', onVisibility);
      if (idleTimerRef.current) window.clearInterval(idleTimerRef.current);
      if (warnTimerRef.current) window.clearInterval(warnTimerRef.current);
    };
  }, [idleOpen, nav]);

  // Keepalive: if user is active and token will expire soon, refresh proactively
  useEffect(() => {
    const interval = window.setInterval(async () => {
      const t = readToken();
      if (!t) return;
      // consider "active" if any activity in last 2 minutes
      const activeRecently = Date.now() - lastActivityRef.current < 2 * 60 * 1000;
      const left = getTimeLeftSec(t) ?? 0;
      // Only refresh if token has less than 2 minutes left AND user is active
      // Increased from 120 to reduce unnecessary refreshes
      if (activeRecently && left > 0 && left <= 60) {
        console.log(`🔄 Keepalive: Refreshing token (${left}s left)`);
        await refreshAccessToken().catch(() => {});
      }
    }, 60 * 1000); // Check every minute
    return () => window.clearInterval(interval);
  }, []);

  // TODO: Next Release - Multi-account switching
  // Multi-account state
  // const [accounts, setAccounts] = useState<StoredAccount[]>([]);

  // Load accounts on mount
  // useEffect(() => {
  //   setAccounts(accountManager.getAllAccounts());
  // }, []);

  // TODO: Next Release - Multi-account switching
  // Sync current token changes back to accountManager
  // This ensures when you switch accounts, you have the latest token
  // useEffect(() => {
  //   if (!user?.id || !token) return;

  //   const currentAccount = accountManager.getActiveAccount();
  //   if (!currentAccount || currentAccount.id !== user.id) return;

  //   // Check if token has changed
  //   if (currentAccount.accessToken !== token) {
  //     console.log('🔄 Syncing updated token to accountManager for user:', user.id);
  //     accountManager.updateTokens(user.id, token);
  //     setAccounts(accountManager.getAllAccounts());
  //   }

  //   // Check if user info has changed (name, avatar, email)
  //   const infoChanged = 
  //     currentAccount.name !== user.name ||
  //     currentAccount.avatar !== user.avatar ||
  //     currentAccount.email !== user.email;

  //   if (infoChanged) {
  //     console.log('🔄 Syncing updated user info to accountManager for user:', user.id);
  //     accountManager.updateAccountInfo(user.id, {
  //       name: user.name,
  //       avatar: user.avatar,
  //       email: user.email
  //     });
  //     setAccounts(accountManager.getAllAccounts());
  //   }
  // }, [token, user]);

  // TODO: Next Release - Multi-account switching
  // Multi-account methods
  /*
  const switchAccount = async (accountId: string) => {
    console.log('🔄 switchAccount called with accountId:', accountId);
    const account = accountManager.switchAccount(accountId);
    console.log('🔄 Retrieved account from accountManager:', account);
    if (!account) {
      console.error('❌ No account found for ID:', accountId);
      return;
    }

    // Validate that account has a valid access token
    if (!account.accessToken || account.accessToken.length === 0) {
      console.error('❌ Account has no valid access token, redirecting to login');
      accountManager.removeAccount(accountId);
      setAccounts(accountManager.getAllAccounts());
      window.location.href = '/login';
      return;
    }

    // Set switching flag to prevent redirects during switch
    isSwitchingAccount.current = true;
    setLoading(true);

    // Helper to handle failed account
    const handleFailedAccount = (reason: string) => {
      console.error('❌ Account switch failed:', reason);
      accountManager.removeAccount(accountId);
      setAccounts(accountManager.getAllAccounts());
      setLoading(false);
      isSwitchingAccount.current = false;
      
      const remainingAccounts = accountManager.getAllAccounts();
      if (remainingAccounts.length > 0) {
        alert(`${reason}\n\nYou have other accounts available.`);
      } else {
        alert(`${reason}\n\nPlease log in again.`);
        window.location.href = '/login';
      }
    };

    // Write tokens to localStorage FIRST
    setTokens({ 
      accessToken: account.accessToken, 
      refreshToken: account.refreshToken 
    });
    
    // Update auth header immediately
    setAuthHeader(account.accessToken);
    setToken(account.accessToken);
    
    // Reset navigation guard
    hasNavigated.current = false;
    
    // Update role in localStorage
    try {
      localStorage.setItem('role', account.role);
    } catch {}

    // Verify token with timeout
    const VALIDATION_TIMEOUT = 10000;
    
    try {
      console.log('🔄 Testing account token validity...');
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Validation timeout')), VALIDATION_TIMEOUT);
      });
      
      const response = await Promise.race([
        api.get('/users/me'),
        timeoutPromise
      ]) as any;
      
      if (response.data) {
        console.log('✅ Token is valid, redirecting to dashboard');
        const userData = response.data.user || response.data;
        
        // Update account manager with latest data
        setAccounts(accountManager.getAllAccounts());
        
        // Determine dashboard path
        const roleUpper = account.role.toUpperCase();
        let targetPath = '/student/dashboard';
        if (roleUpper === 'ADMIN') {
          targetPath = '/admin/dashboard';
        } else if (roleUpper === 'TUTOR') {
          targetPath = '/tutor/dashboard';
        }
        
        // Use full page reload for cleaner state reset
        console.log('✅ Full page reload to:', targetPath);
        window.location.href = targetPath;
        return;
      }
    } catch (error: any) {
      console.log('⚠️ Token validation failed:', error.message);
      
      // Try refresh if token is expired
      if (account.refreshToken) {
        try {
          console.log('🔄 Attempting token refresh...');
          
          const refreshTimeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Refresh timeout')), VALIDATION_TIMEOUT);
          });
          
          const refreshResponse = await Promise.race([
            api.post('/auth/refresh', { refreshToken: account.refreshToken }),
            refreshTimeoutPromise
          ]) as any;
          
          if (refreshResponse.data?.access_token) {
            console.log('✅ Token refreshed successfully');
            const rawAccess = refreshResponse.data.access_token;
            const rawRefresh = refreshResponse.data.refresh_token || account.refreshToken;
            const newAccessToken = (await decryptField(rawAccess)) || rawAccess;
            const newRefreshToken = (await decryptField(rawRefresh)) || rawRefresh;
            
            // Update tokens
            setTokens({ 
              accessToken: newAccessToken, 
              refreshToken: newRefreshToken 
            });
            setAuthHeader(newAccessToken);
            setToken(newAccessToken);
            
            // Update account manager
            accountManager.updateTokens(accountId, newAccessToken, newRefreshToken);
            setAccounts(accountManager.getAllAccounts());
            
            // Determine dashboard path
            const roleUpper = account.role.toUpperCase();
            let targetPath = '/student/dashboard';
            if (roleUpper === 'ADMIN') {
              targetPath = '/admin/dashboard';
            } else if (roleUpper === 'TUTOR') {
              targetPath = '/tutor/dashboard';
            }
            
            // Use full page reload
            console.log('✅ Full page reload after refresh to:', targetPath);
            window.location.href = targetPath;
            return;
          }
        } catch (refreshError: any) {
          console.error('❌ Token refresh failed:', refreshError.message);
          handleFailedAccount('This account session has expired and cannot be refreshed.');
          return;
        }
      }
      
      handleFailedAccount('This account session has expired.');
      return;
    }
  };

  // TODO: Next Release - Multi-account switching
  /*
  const switchAccount = async (accountId: string) => {
    console.log('🔄 switchAccount called with accountId:', accountId);
    const account = accountManager.switchAccount(accountId);
    console.log('🔄 Retrieved account from accountManager:', account);
    if (!account) {
      console.error('❌ No account found for ID:', accountId);
      return;
    }

    // Validate that account has a valid access token
    if (!account.accessToken || account.accessToken.length === 0) {
      console.error('❌ Account has no valid access token, redirecting to login');
      accountManager.removeAccount(accountId);
      setAccounts(accountManager.getAllAccounts());
      window.location.href = '/login';
      return;
    }

    // Set switching flag to prevent redirects during switch
    isSwitchingAccount.current = true;
    setLoading(true);

    // Helper to handle failed account
    const handleFailedAccount = (reason: string) => {
      console.error('❌ Account switch failed:', reason);
      accountManager.removeAccount(accountId);
      setAccounts(accountManager.getAllAccounts());
      setLoading(false);
      isSwitchingAccount.current = false;
      
      const remainingAccounts = accountManager.getAllAccounts();
      if (remainingAccounts.length > 0) {
        alert(`${reason}\n\nYou have other accounts available.`);
      } else {
        alert(`${reason}\n\nPlease log in again.`);
        window.location.href = '/login';
      }
    };

    // Write tokens to localStorage FIRST
    setTokens({ 
      accessToken: account.accessToken, 
      refreshToken: account.refreshToken 
    });
    
    // Update auth header immediately
    setAuthHeader(account.accessToken);
    setToken(account.accessToken);
    
    // Reset navigation guard
    hasNavigated.current = false;
    
    // Update role in localStorage
    try {
      localStorage.setItem('role', account.role);
    } catch {}

    // Verify token with timeout
    const VALIDATION_TIMEOUT = 10000;
    
    try {
      console.log('🔄 Testing account token validity...');
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Validation timeout')), VALIDATION_TIMEOUT);
      });
      
      const response = await Promise.race([
        api.get('/users/me'),
        timeoutPromise
      ]) as any;
      
      if (response.data) {
        console.log('✅ Token is valid, redirecting to dashboard');
        const userData = response.data.user || response.data;
        
        // Update account manager with latest data
        setAccounts(accountManager.getAllAccounts());
        
        // Determine dashboard path
        const roleUpper = account.role.toUpperCase();
        let targetPath = '/student/dashboard';
        if (roleUpper === 'ADMIN') {
          targetPath = '/admin/dashboard';
        } else if (roleUpper === 'TUTOR') {
          targetPath = '/tutor/dashboard';
        }
        
        // Use full page reload for cleaner state reset
        console.log('✅ Full page reload to:', targetPath);
        window.location.href = targetPath;
        return;
      }
    } catch (error: any) {
      console.log('⚠️ Token validation failed:', error.message);
      
      // Try refresh if token is expired
      if (account.refreshToken) {
        try {
          console.log('🔄 Attempting token refresh...');
          
          const refreshTimeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Refresh timeout')), VALIDATION_TIMEOUT);
          });
          
          const refreshResponse = await Promise.race([
            api.post('/auth/refresh', { refresh_token: account.refreshToken }),
            refreshTimeoutPromise
          ]) as any;
          
          if (refreshResponse.data?.access_token) {
            console.log('✅ Token refreshed successfully');
            const rawAccess = refreshResponse.data.access_token;
            const rawRefresh = refreshResponse.data.refresh_token || account.refreshToken;
            const newAccessToken = (await decryptField(rawAccess)) || rawAccess;
            const newRefreshToken = (await decryptField(rawRefresh)) || rawRefresh;
            
            // Update tokens
            setTokens({ 
              accessToken: newAccessToken, 
              refreshToken: newRefreshToken 
            });
            setAuthHeader(newAccessToken);
            setToken(newAccessToken);
            
            // Update account manager
            accountManager.updateTokens(accountId, newAccessToken, newRefreshToken);
            setAccounts(accountManager.getAllAccounts());
            
            // Determine dashboard path
            const roleUpper = account.role.toUpperCase();
            let targetPath = '/student/dashboard';
            if (roleUpper === 'ADMIN') {
              targetPath = '/admin/dashboard';
            } else if (roleUpper === 'TUTOR') {
              targetPath = '/tutor/dashboard';
            }
            
            // Use full page reload
            console.log('✅ Full page reload after refresh to:', targetPath);
            window.location.href = targetPath;
            return;
          }
        } catch (refreshError: any) {
          console.error('❌ Token refresh failed:', refreshError.message);
          handleFailedAccount('This account session has expired and cannot be refreshed.');
          return;
        }
      }
      
      handleFailedAccount('This account session has expired.');
      return;
    }
  };
  */

  // TODO: Next Release - Multi-account add/remove handlers
  /*
  const addAccountHandler = (user: any, accessToken: string, refreshToken: string) => {
    accountManager.addAccount(user, accessToken, refreshToken);
    setAccounts(accountManager.getAllAccounts());
  };

  const removeAccountHandler = (accountId: string) => {
    accountManager.removeAccount(accountId);
    setAccounts(accountManager.getAllAccounts());

    // If removing current account, switch to another or logout
    if (user?.id === accountId) {
      const remaining = accountManager.getAllAccounts();
      if (remaining.length > 0) {
        void switchAccount(remaining[0].id);
      } else {
        // No accounts left, logout
        doLogout();
        setAuthHeader(null);
        setToken(null);
        setUser(null);
        localStorage.removeItem('role');
        nav('/login', { replace: true });
      }
    }
  };
  */

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: loading ? null : !!token,
      setUser,
      logout: () => {
        // TODO: Next Release - Multi-account aware logout
        // For now, simple logout that clears everything
        doLogout();
        setAuthHeader(null);
        setToken(null);
        setUser(null);
        localStorage.removeItem('role');
        nav('/login', { replace: true });
      },
      // TODO: Next Release - Multi-account methods
      // accounts,
      // switchAccount,
      // addAccount: addAccountHandler,
      // removeAccount: removeAccountHandler,
    }),
    [user, token, loading, nav],
  );

  return (
    <>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
      
      {/* Idle Warning Modal */}
      {idleOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Are you still there?</h3>
            <p className="mt-2 text-sm text-slate-600">
              You have been inactive for a while. You will be logged out automatically in {idleCountdown}s.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  if (warnTimerRef.current) window.clearInterval(warnTimerRef.current);
                  setIdleOpen(false);
                  setIdleCountdown(30);
                  lastActivityRef.current = Date.now();
                  // Light keepalive to refresh profile/token if needed
                  void fetchMe().catch(() => {});
                }}
                className="rounded-xl bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
              >
                Continue session
              </button>
              <button
                onClick={() => {
                  if (warnTimerRef.current) window.clearInterval(warnTimerRef.current);
                  doLogout();
                  setAuthHeader(null);
                  setToken(null);
                  setUser(null);
                  localStorage.removeItem('role');
                  nav('/login', { replace: true });
                }}
                className="rounded-xl border px-3 py-1.5 text-sm"
              >
                Logout now
              </button>
            </div>
          </div>
        </div>
      )}

      {kycPrompt.show && (
        <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-8 border border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-indigo-600 text-2xl">🪪</span>
              <h3 className="text-xl font-bold text-slate-900">Complete your tutor KYC</h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed mb-3">
              Your tutor account is not approved yet. Please submit the required profile details and upload your latest qualification certificate to start teaching.
            </p>
            <ul className="text-sm text-slate-700 list-disc ml-5 space-y-1 mb-4">
              <li>Personal info: full name, phone, address</li>
              <li>Bank details for payouts</li>
              <li>Upload a clear selfie and at least one degree/qualification</li>
            </ul>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-lg border text-sm"
                onClick={() => setKycPrompt({ show: false, status: kycPrompt.status })}
              >
                Later
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                onClick={() => {
                  setKycPrompt({ show: false, status: kycPrompt.status });
                  nav('/tutor/kyc');
                }}
              >
                Go to KYC
              </button>
            </div>
          </div>
        </div>
      )}

      {blocked.active && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-8 border border-red-200">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-red-600 text-2xl">⚠️</span>
              <h3 className="text-xl font-bold text-slate-900">Account blocked</h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed mb-3">
              Due to repeated attempts to share personal contact information, this account is blocked until an admin reviews it.
            </p>
            <p className="text-sm text-slate-700 mb-3 font-semibold">Strikes: {blocked.strikes}/{blocked.max}</p>
            <p className="text-sm text-slate-700 leading-relaxed mb-3">
              {user?.role === 'TUTOR'
                ? 'As per policy, any pending earnings that are not yet disbursed will not be returned.'
                : 'All purchased tokens are canceled and you will not be able to attend classes with any tutor.'}
            </p>
            <ul className="text-sm text-slate-700 list-disc ml-5 space-y-1 mb-4">
              <li>Do not share phone numbers, emails, or social links.</li>
              <li>Keep conversations on the platform for safety.</li>
              <li>If you have questions, contact <a className="text-blue-600" href="mailto:support@tunectnow.com">support@tunectnow.com</a>.</li>
            </ul>
            <div className="text-sm text-red-700 font-semibold">Access is restricted until an admin unblocks your account.</div>
          </div>
        </div>
      )}
    </>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
