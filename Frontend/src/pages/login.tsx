// src/pages/login.tsx
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { login as doLogin } from '../services/authService';
import { readToken, setAuthStorage } from '../lib/apiClient';

// Credential Management API types (not in all TS libs)
declare global {
  interface PasswordCredentialInit {
    id: string;
    password: string;
    name?: string;
  }
  interface PasswordCredential extends Credential {
    readonly password: string;
  }
  // eslint-disable-next-line no-var
  var PasswordCredential: {
    new (init: PasswordCredentialInit): PasswordCredential;
    prototype: PasswordCredential;
  };
}

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Detect browser autofill: browsers fill the DOM element but may not trigger
  // React's onChange. Poll briefly on mount to sync state from autofilled values.
  useEffect(() => {
    const syncAutofill = () => {
      const emailEl = emailRef.current;
      const pwEl = passwordRef.current;
      if (emailEl && emailEl.value && !email) setEmail(emailEl.value);
      if (pwEl && pwEl.value && !password) setPassword(pwEl.value);
    };
    // Most browsers fill within 300ms of page load; check a few times
    const timers = [
      setTimeout(syncAutofill, 100),
      setTimeout(syncAutofill, 500),
      setTimeout(syncAutofill, 1500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Use Credential Management API to auto-fill saved credentials (Chromium)
  useEffect(() => {
    if (!navigator.credentials?.get) return;
    navigator.credentials
      .get({ password: true, mediation: 'silent' } as CredentialRequestOptions)
      .then((cred) => {
        if (cred?.type === 'password') {
          const pc = cred as PasswordCredential;
          if (pc.id) setEmail(pc.id);
          if (pc.password) setPassword(pc.password);
        }
      })
      .catch(() => { /* credential manager unavailable or denied */ });
  }, []);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  const fallbackRedirect = () => {
    const role = (localStorage.getItem('role')?.toUpperCase() as RoleApi) || 'STUDENT';
    if (role === 'ADMIN') window.location.assign('/admin/dashboard');
    else if (role === 'TUTOR') window.location.assign('/tutor/dashboard');
    else window.location.assign('/student/dashboard');
  };

  async function submit() {
    // Re-read from DOM in case browser autofill didn't fire onChange
    const emailVal = (emailRef.current?.value || email).trim().toLowerCase();
    const pwVal = passwordRef.current?.value || password;

    if (!emailVal || !pwVal) {
      setErr('Please enter email and password.');
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      setAuthStorage(remember);
      const res = await doLogin(emailVal, pwVal);
      try { localStorage.setItem('auth_ok', '1'); } catch {}

      // Store credentials in browser for future autofill (Credential Management API)
      if (remember && navigator.credentials?.store && typeof PasswordCredential !== 'undefined') {
        try {
          const cred = new PasswordCredential({
            id: emailVal,
            password: pwVal,
            name: emailVal,
          });
          await navigator.credentials.store(cred);
        } catch { /* Credential Manager unavailable or user denied */ }
      }

      // Extract user data and tokens from response
      const role = ensureRoleStored(res);
      try { window.dispatchEvent(new Event('auth:login')); } catch {}

      if (role === 'ADMIN') window.location.assign('/admin/dashboard');
      else if (role === 'TUTOR') window.location.assign('/tutor/dashboard');
      else if (role === 'STUDENT') window.location.assign('/student/dashboard');
      else setTimeout(fallbackRedirect, 150);
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
                ref={emailRef}
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
                  ref={passwordRef}
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
                Remember me
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
