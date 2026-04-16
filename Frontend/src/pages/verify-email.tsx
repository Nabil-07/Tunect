// src/pages/verify-email.tsx
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail, resendVerificationEmail } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';

type State = 'loading' | 'success' | 'error' | 'no-token';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const token = searchParams.get('token');

  const [state, setState] = useState<State>(token ? 'loading' : 'no-token');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendOk, setResendOk] = useState(false);
  const [resendErr, setResendErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyEmail(token)
      .then(() => {
        if (!cancelled) setState('success');
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setState('error');
          setErrorMsg(e.message);
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  const dashboardHref =
    user?.role?.toUpperCase() === 'TUTOR'
      ? '/tutor/dashboard'
      : user?.role?.toUpperCase() === 'ADMIN'
      ? '/admin/dashboard'
      : '/student/dashboard';

  async function handleResend() {
    setResendLoading(true);
    setResendErr(null);
    try {
      await resendVerificationEmail();
      setResendOk(true);
    } catch (e: any) {
      setResendErr(e.message || 'Failed to resend. Please try again.');
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        {state === 'loading' && (
          <>
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <h1 className="text-xl font-semibold text-slate-800">Verifying your email…</h1>
            <p className="mt-2 text-slate-500 text-sm">This will only take a moment.</p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-800">Email verified!</h1>
            <p className="mt-2 text-slate-500 text-sm">Your email address has been successfully verified.</p>
            <Link
              to={user ? dashboardHref : '/login'}
              className="mt-6 inline-block w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
            >
              {user ? 'Go to Dashboard' : 'Log In'}
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-800">Verification failed</h1>
            <p className="mt-2 text-slate-500 text-sm">
              {errorMsg || 'The link may have expired or already been used.'}
            </p>

            {user && (
              <div className="mt-6">
                {resendOk ? (
                  <p className="text-green-600 text-sm font-medium">Verification email sent! Check your inbox.</p>
                ) : (
                  <>
                    <button
                      onClick={handleResend}
                      disabled={resendLoading}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
                    >
                      {resendLoading ? 'Sending…' : 'Resend verification email'}
                    </button>
                    {resendErr && <p className="mt-2 text-red-500 text-sm">{resendErr}</p>}
                  </>
                )}
              </div>
            )}

            <Link
              to={user ? dashboardHref : '/login'}
              className="mt-4 inline-block text-indigo-600 hover:underline text-sm"
            >
              {user ? 'Back to Dashboard' : 'Back to Login'}
            </Link>
          </>
        )}

        {state === 'no-token' && (
          <>
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-800">Invalid link</h1>
            <p className="mt-2 text-slate-500 text-sm">
              No verification token found. Please use the link from your welcome email.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-block text-indigo-600 hover:underline text-sm"
            >
              Back to Login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
