// src/pages/forgot-password.tsx
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  requestPasswordResetStart,
  requestPasswordResetVerify,
  requestPasswordResetResend,
  requestPasswordResetFinalize,
} from '../services/authService';

type Method = 'email' | 'phone';

export default function ForgotPassword() {
  const nav = useNavigate();

  // Step state
  // step 1: choose + enter email/phone
  // step 2: otp verify
  // step 3: set new password
  // step 4: done
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Method + contact
  const [method, setMethod] = useState<Method>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(''); // Expect E.164 or plain digits; backend will validate

  // Server-issued IDs / tokens
  const [resetId, setResetId] = useState<string | null>(null); // from start
  const [masked, setMasked] = useState<string>(''); // masked destination from server
  const [verifyToken, setVerifyToken] = useState<string | null>(null); // from verify

  // OTP + Password
  const [otp, setOtp] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');

  // UX
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Simple derived flags
  const contact = method === 'email' ? email.trim().toLowerCase() : phone.trim();
  const canStart = useMemo(
    () => !!contact && !loading,
    [contact, loading]
  );
  const canVerify = useMemo(
    () => otp.trim().length >= 4 && !loading,
    [otp, loading]
  );
  const canFinalize = useMemo(
    () => pw.length >= 6 && pw === pw2 && !loading,
    [pw, pw2, loading]
  );

  // Cooldown timer for resend
  useEffect(() => {
    if (!resendCooldown) return;
    const t = setInterval(() => setResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  function clearAlerts() {
    setErr(null);
    setOk(null);
  }

  async function handleStart(e: FormEvent) {
    e.preventDefault();
    if (!canStart) return;

    clearAlerts();
    setLoading(true);
    try {
      const res = await requestPasswordResetStart({ method, value: contact });
      // Expect: { resetId, maskedDestination, ttl }
      setResetId(res.resetId);
      setMasked(res.maskedDestination || '');
      setStep(2);
      setOk(`OTP sent to ${res.maskedDestination || (method === 'email' ? 'your email' : 'your phone')}.`);
      setResendCooldown(30); // avoid spam; backend TTL governs real limit
    } catch (e: any) {
      const msg = String(e?.message || 'Could not start password reset.');
      // If not found, show create account prompt
      if (/not found|doesn.?t exist|no account/i.test(msg)) {
        setErr(
          `${method === 'email' ? 'Email' : 'Phone number'} not found. ` +
          `You can `
        );
      } else {
        setErr(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!canVerify || !resetId) return;

    clearAlerts();
    setLoading(true);
    try {
      const res = await requestPasswordResetVerify({ resetId, otp: otp.trim() });
      // Expect: { token } which is used to finalize
      setVerifyToken(res.token);
      setStep(3);
      setOk('OTP verified. Please set your new password.');
    } catch (e: any) {
      setErr(String(e?.message || 'Invalid or expired OTP.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalize(e: FormEvent) {
    e.preventDefault();
    if (!canFinalize || !verifyToken) return;

    clearAlerts();
    setLoading(true);
    try {
      await requestPasswordResetFinalize({ token: verifyToken, password: pw });
      setStep(4);
      setOk('Password reset successfully. Redirecting to login…');
      setTimeout(() => nav('/login', { replace: true }), 1200);
    } catch (e: any) {
      setErr(String(e?.message || 'Unable to update password. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!resetId || resendCooldown) return;
    clearAlerts();
    setLoading(true);
    try {
      await requestPasswordResetResend({ resetId });
      setOk('OTP resent.');
      setResendCooldown(30);
    } catch (e: any) {
      setErr(String(e?.message || 'Could not resend OTP.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[70vh] flex items-center" data-testid="forgot-password-page">
      <div className="container-px mx-auto max-w-md w-full">
        <h1 className="text-2xl font-extrabold text-center" data-testid="forgot-password-title">
          {step === 1 && 'Reset your password'}
          {step === 2 && 'Verify OTP'}
          {step === 3 && 'Set a new password'}
          {step === 4 && 'All set!'}
        </h1>

        {/* Alerts */}
        <div className="mt-4 space-y-2" aria-live="polite" aria-atomic="true">
          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="forgot-password-error">
              {err}{' '}
              {/not found|doesn.?t exist|no account/i.test(err) && (
                <Link to="/signup" className="text-ocean-700 font-medium underline" data-testid="forgot-password-signup-link">
                  Create a new account
                </Link>
              )}
            </div>
          )}
          {ok && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" data-testid="forgot-password-success">
              {ok}
            </div>
          )}
        </div>

        {/* STEP 1: Choose method + enter contact */}
        {step === 1 && (
          <form onSubmit={handleStart} className="mt-6 space-y-5" data-testid="forgot-password-step1-form">
            {/* Toggle */}
            <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 mx-auto">
              <button
                type="button"
                onClick={() => setMethod('email')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                  method === 'email'
                    ? 'bg-ocean-700 text-white shadow-soft'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
                data-testid="forgot-password-method-email-btn"
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => setMethod('phone')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                  method === 'phone'
                    ? 'bg-ocean-700 text-white shadow-soft'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
                data-testid="forgot-password-method-phone-btn"
              >
                Phone
              </button>
            </div>

            {method === 'email' ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-ocean-300 disabled:opacity-60"
                  autoComplete="email"
                  disabled={loading}
                  required
                  data-testid="forgot-password-email-input"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-ocean-300 disabled:opacity-60"
                  autoComplete="tel"
                  disabled={loading}
                  required
                  data-testid="forgot-password-phone-input"
                />
                <p className="mt-1 text-xs text-slate-500">Use your registered number.</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canStart}
              className={`w-full rounded-2xl py-3 text-white font-medium shadow-soft
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 active:scale-[0.99]
                ${canStart ? 'bg-ocean-700 hover:bg-ocean-800' : 'bg-ocean-700/60'}`}
              data-testid="forgot-password-send-otp-btn"
            >
              {loading ? 'Sending OTP…' : 'Send OTP'}
            </button>

            <p className="text-center text-sm text-slate-600">
              Remembered it?{' '}
              <Link to="/login" className="text-ocean-700 font-medium hover:underline" data-testid="forgot-password-back-login-link">
                Back to login
              </Link>
            </p>
          </form>
        )}

        {/* STEP 2: Enter OTP */}
        {step === 2 && (
          <form onSubmit={handleVerify} className="mt-6 space-y-4" data-testid="forgot-password-step2-form">
            <p className="text-sm text-slate-600">
              Enter the 4–6 digit code sent to{' '}
              <span className="font-medium">{masked || (method === 'email' ? 'your email' : 'your phone')}</span>.
            </p>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">OTP</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="Enter OTP"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-ocean-300 disabled:opacity-60"
                disabled={loading}
                required
                data-testid="forgot-password-otp-input"
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={handleResend}
                disabled={loading || resendCooldown > 0}
                className={`font-medium ${resendCooldown ? 'text-slate-500' : 'text-ocean-700 hover:underline'}`}
                data-testid="forgot-password-resend-otp-btn"
              >
                {resendCooldown ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-slate-600 hover:underline"
                data-testid="forgot-password-change-contact-btn"
              >
                Change email/phone
              </button>
            </div>

            <button
              type="submit"
              disabled={!canVerify}
              className={`w-full rounded-2xl py-3 text-white font-medium shadow-soft
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 active:scale-[0.99]
                ${canVerify ? 'bg-ocean-700 hover:bg-ocean-800' : 'bg-ocean-700/60'}`}
              data-testid="forgot-password-verify-btn"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        )}

        {/* STEP 3: New password */}
        {step === 3 && (
          <form onSubmit={handleFinalize} className="mt-6 space-y-4" data-testid="forgot-password-step3-form">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Enter a new password"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-ocean-300 disabled:opacity-60"
                minLength={6}
                autoComplete="new-password"
                required
                data-testid="forgot-password-new-pw-input"
              />
              <p className="mt-1 text-xs text-slate-500">Minimum 6 characters.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Confirm password</label>
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="Re-enter password"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-ocean-300 disabled:opacity-60"
                autoComplete="new-password"
                required
                data-testid="forgot-password-confirm-pw-input"
              />
            </div>

            <button
              type="submit"
              disabled={!canFinalize}
              className={`w-full rounded-2xl py-3 text-white font-medium shadow-soft
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 active:scale-[0.99]
                ${canFinalize ? 'bg-ocean-700 hover:bg-ocean-800' : 'bg-ocean-700/60'}`}
              data-testid="forgot-password-set-pw-btn"
            >
              {loading ? 'Updating…' : 'Set new password'}
            </button>
          </form>
        )}

        {/* STEP 4: Done */}
        {step === 4 && (
          <div className="mt-6 text-center" data-testid="forgot-password-done">
            <p className="text-slate-700">Password reset successfully.</p>
            <p className="text-slate-500 text-sm mt-1">
              Redirecting you to&nbsp;
              <Link to="/login" className="text-ocean-700 font-medium underline" data-testid="forgot-password-done-login-link">Login</Link>
              …
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
