// src/pages/login.tsx
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { login as doLogin } from '../services/authService';
import { readToken, setAuthStorage } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';

type RoleApi = 'STUDENT' | 'TUTOR' | 'ADMIN';

// sanitize API base (no trailing slash)
const rawApiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const apiBase = String(rawApiBase).replace(/\/+$/, '');

/** Try to store role in localStorage from either the login result or JWT. */
function ensureRoleStored(loginResult?: any): RoleApi | null {
  const fromResult =
    loginResult?.user?.role ??
    loginResult?.data?.user?.role ??
    loginResult?.role ??
    loginResult?.data?.role;

  let role: any = fromResult;

  // Fallback: decode JWT
  if (!role) {
    try {
      const token = (readToken() || '').replace(/^Bearer\s+/i, '');
      const [, payloadB64] = token.split('.');
      if (payloadB64) {
        const json = JSON.parse(atob(payloadB64));
        role =
          json.role ??
          json.user?.role ??
          json['https://tunect.app/role'] ??
          json['https://tunect/role'];
      }
    } catch { /* ignore */ }
  }

  if (!role) return null;
  const up = String(role).toUpperCase() as RoleApi;
  try { localStorage.setItem('role', up); } catch {}
  return up;
}

export default function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  
  // Check if user is adding another account
  const [isAddingAccount, setIsAddingAccount] = useState(false);

  // Note: Redirect handled by PublicOnlyRoute wrapper in App.tsx

  // Check on mount
  useState(() => {
    try {
      const adding = localStorage.getItem('adding_account');
      if (adding === 'true') {
        setIsAddingAccount(true);
        localStorage.removeItem('adding_account');
      }
    } catch {}
  });

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  const fallbackRedirect = () => {
    const role = (localStorage.getItem('role')?.toUpperCase() as RoleApi) || 'STUDENT';
    if (role === 'ADMIN') window.location.assign('/admin/dashboard');
    else if (role === 'TUTOR') window.location.assign('/tutor/dashboard');
    else window.location.assign('/student/dashboard');
  };

  async function submit() {
    if (!email.trim() || !password) {
      setErr('Please enter email and password.');
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      setAuthStorage(remember);
      const res = await doLogin(email.trim().toLowerCase(), password);
      try { localStorage.setItem('auth_ok', '1'); } catch {}

      // Extract user data and tokens from response
      const user = res?.user || res?.data?.user;
      const accessToken = res?.access_token || res?.accessToken || res?.token || res?.jwt;
      const refreshToken = res?.refresh_token || res?.refreshToken;

      console.log('Login response:', { user, hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken });

      if (user && accessToken) {
        // Add account to multi-account system
        console.log('Calling addAccount with:', { userId: user.id, email: user.email, role: user.role });
        await auth.addAccount(user, accessToken, refreshToken);
        
        console.log('Account added. All accounts:', auth.accounts);
        console.log('LocalStorage after addAccount:', JSON.parse(localStorage.getItem('tunect_accounts') || '{}'));

        try { window.dispatchEvent(new Event('auth:login')); } catch {}

        // Small delay to ensure localStorage is written
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('About to navigate to dashboard');

        // Navigate to appropriate dashboard
        const role = user.role?.toUpperCase();
        if (role === 'ADMIN') window.location.assign('/admin/dashboard');
        else if (role === 'TUTOR') window.location.assign('/tutor/dashboard');
        else window.location.assign('/student/dashboard');
      } else {
        // Fallback to old flow if user data not found
        const role = ensureRoleStored(res);
        try { window.dispatchEvent(new Event('auth:login')); } catch {}
        if (!role) setTimeout(fallbackRedirect, 150);
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        'Login failed. Please check your credentials.';
      setErr(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setLoading(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const GoogleButton = () => {
    const go = () => {
      try { localStorage.setItem('remember_intent', remember ? '1' : '0'); } catch {}
      const url = new URL(`${apiBase}/auth/google`);
      if (remember) url.searchParams.set('remember', '1');
      window.location.href = url.toString();
    };
    return (
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium
                   hover:bg-slate-50 transition disabled:opacity-60"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt=""
            className="h-5 w-5"
          />
          Sign in with Google
        </span>
      </button>
    );
  };

  return (
    <main className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* LEFT: form */}
      <section className="flex flex-col">
        <div className="mx-auto w-full max-w-md px-6 py-8 md:py-12 flex-1">
          {/* Logo / brand */}
          <div className="mb-8">
            <Link to="/" className="inline-flex items-center gap-2">
              <img 
                src="/tunect_logo_hd.png" 
                alt="Tunect Logo" 
                className="h-10 w-10 rounded-lg shadow-md object-contain"
              />
              <span className="text-xl font-semibold text-slate-900">Tunect</span>
            </Link>
          </div>

          <h1 className="text-3xl font-bold text-slate-900">Welcome back</h1>
          <p className="mt-2 text-slate-600">Please enter your details</p>

          {isAddingAccount && (
            <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
              <svg className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-900">Adding another account</p>
                <p className="text-xs text-blue-700 mt-0.5">Sign in with a different account to switch between them easily.</p>
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-8 space-y-5" autoComplete="on" noValidate>
            {err && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
                Email address
              </label>
              <input
                id="username"
                name="username"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-ocean-300 disabled:opacity-60"
                autoComplete="username"
                inputMode="email"
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="current-password" className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="current-password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm
                             focus:outline-none focus:ring-2 focus:ring-ocean-300 disabled:opacity-60"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  aria-controls="current-password"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute inset-y-0 right-2 my-auto inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-60"
                  disabled={loading}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="mt-1 flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  disabled={loading}
                />
                Remember for 30 days
              </label>
              <Link to="/forgot-password" className="text-sm text-ocean-700 hover:underline">
                Forgot password
              </Link>
            </div>

            {/* Sign in */}
            <button
              type="submit"
              disabled={!canSubmit}
              className={`w-full rounded-lg py-3 text-white font-medium shadow-sm
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300
                ${canSubmit ? 'bg-ocean-700 hover:bg-ocean-800' : 'bg-ocean-700/60'}`}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <GoogleButton />

            <p className="text-center text-sm text-slate-600">
              Don&apos;t have an account?{' '}
              <Link to="/signup" className="text-ocean-700 font-medium hover:underline">
                Sign up
              </Link>
            </p>
          </form>

          {import.meta.env.DEV && readToken() && (
            <p className="mt-6 text-xs text-slate-500">
              You already have a token; if redirects feel odd, clear storage and retry.
            </p>
          )}
        </div>
      </section>

      {/* RIGHT panel */}
      <aside className="relative hidden md:block">
        <div className="absolute inset-0 bg-violet-600" />
        <svg className="absolute inset-0 h-full w-full opacity-20" aria-hidden="true" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice">
          <defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="white" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
        <div className="relative z-10 flex h-full items-center justify-center p-12">
          <Illustration />
        </div>
      </aside>
    </main>
  );
}

function Illustration() {
  return (
    <svg width="520" height="360" viewBox="0 0 520 360" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-2xl">
      <rect x="40" y="120" width="440" height="220" rx="16" fill="#2e1065" opacity="0.35" />
      <rect x="60" y="100" width="440" height="220" rx="16" fill="#4c1d95" />
      <circle cx="210" cy="160" r="40" fill="#fff" opacity="0.95" />
      <path d="M190 250c0-22 18-40 40-40s40 18 40 40v30H190v-30z" fill="#fff" opacity="0.95" />
      <circle cx="260" cy="150" r="6" fill="#4c1d95" />
      <rect x="320" y="150" width="120" height="14" rx="7" fill="#c4b5fd" />
      <rect x="320" y="176" width="96" height="12" rx="6" fill="#ddd6fe" />
      <rect x="320" y="198" width="140" height="12" rx="6" fill="#ddd6fe" />
      <rect x="320" y="220" width="110" height="12" rx="6" fill="#c4b5fd" />
      <rect x="320" y="242" width="130" height="12" rx="6" fill="#ddd6fe" />
      <g opacity="0.9">
        <circle cx="110" cy="80" r="10" fill="#c4b5fd" />
        <circle cx="410" cy="70" r="14" fill="#ddd6fe" />
        <circle cx="470" cy="110" r="9" fill="#c4b5fd" />
      </g>
      <g>
        <circle cx="265" cy="300" r="20" fill="#22c55e" />
        <path d="M257 299l6 6 12-14" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
