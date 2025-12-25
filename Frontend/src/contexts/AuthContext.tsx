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
import { accountManager, type StoredAccount } from '../services/accountManager';

type RoleApi = 'STUDENT' | 'TUTOR' | 'ADMIN';
type User = {
  id: string;
  email: string;
  role?: RoleApi | string;
  name?: string;
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
  // Multi-account methods
  accounts: StoredAccount[];
  switchAccount: (accountId: string) => Promise<void>;
  addAccount: (user: any, accessToken: string, refreshToken: string) => void;
  removeAccount: (accountId: string) => void;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

function hasProfile(u: any): boolean {
  if (!u) return false;
  const hasStudent = !!u.student?.id;
  const hasTutor = !!u.tutor?.id;
  const hasRole = u.role === 'STUDENT' || u.role === 'TUTOR';
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
  const lastActivityRef = useRef<number>(Date.now());
  const idleTimerRef = useRef<number | null>(null);
  const warnTimerRef = useRef<number | null>(null);
  const hasNavigated = useRef(false); // ✅ bounce guard

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
        if (alive) setUser(resolved);
      } catch {
        if (alive) setUser(null);
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
    if (loading || !token || hasNavigated.current) return;

    const path = loc.pathname || '';
    const onChoose = path.startsWith('/choose-role');
    const onAuth = path.startsWith('/login') || path.startsWith('/oauth');

    if (!onChoose && !onAuth && !hasProfile(user)) {
      hasNavigated.current = true;
      nav('/choose-role', { replace: true });
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

    function onRefreshed() {
      void rehydrate();
    }

    function onUnauthorized() {
      setToken(null);
      setUser(null);
      setAuthHeader(null);
      localStorage.removeItem('role');
    }

    function onStorage(e: StorageEvent) {
      if (!e.key || !['tunect_access_token', 'accessToken', 'token'].includes(e.key)) return;
      void rehydrate();
    }

    window.addEventListener('auth:refreshed', onRefreshed);
    window.addEventListener('auth:unauthorized', onUnauthorized);
    window.addEventListener('storage', onStorage);

    return () => {
      alive = false;
      window.removeEventListener('auth:refreshed', onRefreshed);
      window.removeEventListener('auth:unauthorized', onUnauthorized);
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
      if (activeRecently && left > 0 && left <= 120) {
        await refreshAccessToken().catch(() => {});
      }
    }, 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Multi-account state
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);

  // Load accounts on mount
  useEffect(() => {
    setAccounts(accountManager.getAllAccounts());
  }, []);

  // Multi-account methods
  const switchAccount = async (accountId: string) => {
    console.log('🔄 switchAccount called with accountId:', accountId);
    const account = accountManager.switchAccount(accountId);
    console.log('🔄 Retrieved account from accountManager:', account);
    if (!account) {
      console.error('❌ No account found for ID:', accountId);
      return;
    }

    // Write tokens to localStorage FIRST (so API calls use the correct token)
    writeToken(account.accessToken);
    writeRefreshToken(account.refreshToken);
    setAuthHeader(account.accessToken);
    setToken(account.accessToken);
    console.log('🔄 Tokens written to storage and auth header set');

    try {
      const u = await fetchMe();
      const resolved = (u as any)?.user ?? u ?? null;
      console.log('🔄 Fetched user after switch:', resolved);
      setUser(resolved);

      // Update localStorage role
      if (resolved?.role) {
        try {
          localStorage.setItem('role', resolved.role);
        } catch {}
      }

      // Navigate to appropriate dashboard
      const role = account.role.toUpperCase();
      console.log('🔄 Navigating to dashboard for role:', role);
      if (role === 'ADMIN') {
        nav('/admin/dashboard', { replace: true });
      } else if (role === 'TUTOR') {
        nav('/tutor/dashboard', { replace: true });
      } else if (role === 'STUDENT') {
        nav('/student/dashboard', { replace: true });
      }

      // Update accounts list
      setAccounts(accountManager.getAllAccounts());
      console.log('✅ Account switch complete');
    } catch (err) {
      console.error('❌ Failed to switch account:', err);
    }
  };

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

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: loading ? null : !!token,
      setUser,
      logout: () => {
        // Logout current account only (explicit logout)
        if (user?.id) {
          removeAccountHandler(user.id);
        } else {
          // Fallback: logout completely
          accountManager.clearAll();
          doLogout();
          setAuthHeader(null);
          setToken(null);
          setUser(null);
          localStorage.removeItem('role');
          nav('/login', { replace: true });
        }
      },
      // Multi-account methods
      accounts,
      switchAccount,
      addAccount: addAccountHandler,
      removeAccount: removeAccountHandler,
    }),
    [user, token, loading, accounts, nav],
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
    </>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
