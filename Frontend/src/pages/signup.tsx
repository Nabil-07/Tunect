// src/pages/signup.tsx
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signup, login } from '../services/authService';
import { setAuthStorage } from '../lib/apiClient';
import { http } from '../api/http';
import { AlertTriangle } from 'lucide-react';
import {
  SITE_SHUTDOWN,
  SIGNUP_DISABLED_MESSAGE,
} from '../config/siteShutdown';

type Role = 'student' | 'tutor';

// sanitize API base (no trailing slash)
const rawApiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const apiBase = String(rawApiBase).replace(/\/+$/, '');

export default function Signup() {
  const nav = useNavigate();
  const [role, setRole] = useState<Role>('tutor');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true); // << remember me
  const [loading, setLoading] = useState(false);
  const [roleControls, setRoleControls] = useState({ tutorRoleEnabled: true, studentRoleEnabled: false });

  // error state
  const [err, setErr] = useState<string | null>(null);
  const [emailExists, setEmailExists] = useState(false);

  useEffect(() => {
    http.get('/admin-controls/public').then(r => {
      const d = r.data;
      setRoleControls({
        tutorRoleEnabled: d?.tutorRoleEnabled ?? true,
        studentRoleEnabled: d?.studentRoleEnabled ?? false,
      });
      // Auto-select an enabled role
      if (d?.tutorRoleEnabled) setRole('tutor');
      else if (d?.studentRoleEnabled) setRole('student');
    }).catch(() => {});
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (SITE_SHUTDOWN) {
      setErr(SIGNUP_DISABLED_MESSAGE);
      return;
    }
    setErr(null);
    setEmailExists(false);

    // Check if the selected role is enabled
    if (role === 'student' && !roleControls.studentRoleEnabled) {
      setErr('Student registration is currently disabled. Please try again later.');
      return;
    }
    if (role === 'tutor' && !roleControls.tutorRoleEnabled) {
      setErr('Tutor registration is currently disabled. Please try again later.');
      return;
    }

    setLoading(true);
    try {
      setAuthStorage(remember);

      await signup({ email: email.trim(), password, role });
      await login(email.trim(), password);

      const r = (localStorage.getItem('role') as Role) || role;
      if (r === 'tutor') nav('/tutor/dashboard', { replace: true });
      else nav('/student/dashboard', { replace: true });
    } catch (e: any) {
      if (e?.response?.status === 409) {
        setEmailExists(true);
        setErr('Email is already registered');
      } else {
        const msg =
          e?.response?.data?.message ||
          e?.message ||
          'Sign up failed. Please check details and try again.';
        setErr(Array.isArray(msg) ? msg.join(', ') : String(msg));
      }
    } finally {
      setLoading(false);
    }
  };

  // Google sign-up preserves role + remember choice for callback
  const signUpWithGoogle = () => {
    if (SITE_SHUTDOWN) {
      setErr(SIGNUP_DISABLED_MESSAGE);
      return;
    }
    try {
      localStorage.setItem('pref_role', role.toUpperCase());
      localStorage.setItem('remember_intent', remember ? '1' : '0');
      localStorage.setItem('auth_ok', '0');
    } catch {}
    const url = new URL(`${apiBase}/auth/google`);
    if (remember) url.searchParams.set('remember', '1');
    window.location.href = url.toString();
  };

  return (
    <main className="min-h-[70vh] flex items-center" data-testid="signup-page">
      <div className="container-px mx-auto max-w-md w-full">
        <h1 className="text-2xl font-extrabold text-center" data-testid="signup-title">Create your Tunect account</h1>

        {SITE_SHUTDOWN && (
          <div
            className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="alert"
            data-testid="signup-shutdown-alert"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
            <p>{SIGNUP_DISABLED_MESSAGE}</p>
          </div>
        )}

        {/* Role toggle */}
        <div className="mt-6 flex items-center justify-center">
          <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => roleControls.studentRoleEnabled && setRole('student')}
              disabled={!roleControls.studentRoleEnabled}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition
                ${!roleControls.studentRoleEnabled
                  ? 'text-slate-400 cursor-not-allowed opacity-50'
                  : role === 'student'
                  ? 'bg-ocean-700 text-white shadow-soft'
                  : 'text-slate-700 hover:bg-slate-50'}`}
              data-testid="signup-role-student-btn"
            >
              Student {!roleControls.studentRoleEnabled && '(Coming Soon)'}
            </button>
            <button
              type="button"
              onClick={() => roleControls.tutorRoleEnabled && setRole('tutor')}
              disabled={!roleControls.tutorRoleEnabled}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition
                ${!roleControls.tutorRoleEnabled
                  ? 'text-slate-400 cursor-not-allowed opacity-50'
                  : role === 'tutor'
                  ? 'bg-ocean-700 text-white shadow-soft'
                  : 'text-slate-700 hover:bg-slate-50'}`}
              data-testid="signup-role-tutor-btn"
            >
              Tutor {!roleControls.tutorRoleEnabled && '(Coming Soon)'}
            </button>
          </div>
        </div>

        {/* Google signup */}
        <div className="mt-6">
          <button
            type="button"
            onClick={signUpWithGoogle}
            disabled={loading || SITE_SHUTDOWN}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium
                       hover:bg-slate-50 transition disabled:opacity-60"
            data-testid="signup-google-btn"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="h-5 w-5" />
              Continue with Google
            </span>
          </button>

          {/* divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-slate-500">or sign up with email</span>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" data-testid="signup-form">
          {err && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="signup-error-alert">
              {emailExists ? (
                <>
                  {err}. <Link to="/login" className="text-ocean-700 font-medium underline" data-testid="signup-login-link">Login</Link>
                </>
              ) : (err)}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-ocean-300"
              required
              autoComplete="name"
              disabled={loading || SITE_SHUTDOWN}
              data-testid="signup-name-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-ocean-300"
              required
              autoComplete="email"
              disabled={loading || SITE_SHUTDOWN}
              data-testid="signup-email-input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-ocean-300"
              required
              autoComplete="new-password"
              minLength={6}
              disabled={loading || SITE_SHUTDOWN}
              data-testid="signup-password-input"
            />
            <p className="mt-1 text-xs text-slate-500">Minimum 6 characters.</p>
          </div>

          {/* Remember me */}
          <label className="inline-flex items-center gap-2 text-sm text-slate-600" data-testid="signup-remember-label">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={loading || SITE_SHUTDOWN}
              data-testid="signup-remember-checkbox"
            />
            Remember for 30 days
          </label>

          <button
            type="submit"
            disabled={loading || SITE_SHUTDOWN}
            className="w-full rounded-2xl bg-ocean-700 py-3 text-white font-medium shadow-soft
                       hover:bg-ocean-800 focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-ocean-300 active:scale-[0.99] disabled:opacity-60"
            data-testid="signup-submit-btn"
          >
            {loading ? 'Creating account…' : 'Sign Up'}
          </button>

          <p className="text-center text-sm text-slate-600">
            Already have an account? <Link to="/login" className="text-ocean-700 font-medium hover:underline" data-testid="signup-go-login-link">Login</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
