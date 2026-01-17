// src/pages/account/security.tsx
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { changePassword, me as fetchMe } from '../../services/authService';

export default function AccountSecurity() {
  const { user, setUser } = useAuth() as any;
  const { showSuccess, showError } = useToast();

  const [resolvedHasPassword, setResolvedHasPassword] = useState<boolean | null>(
    typeof user?.hasPassword === 'boolean' ? user.hasPassword : null,
  );

  useEffect(() => {
    let alive = true;
    const resolve = async () => {
      if (!user) return;
      if (typeof user.hasPassword === 'boolean') {
        setResolvedHasPassword(user.hasPassword);
        return;
      }
      try {
        const fresh = await fetchMe();
        if (!alive) return;
        if (fresh && typeof fresh.hasPassword === 'boolean') {
          setUser(fresh);
          setResolvedHasPassword(fresh.hasPassword);
        } else {
          setResolvedHasPassword(true);
        }
      } catch {
        if (alive) setResolvedHasPassword(true);
      }
    };
    void resolve();
    return () => {
      alive = false;
    };
  }, [user, setUser]);

  const hasPassword = resolvedHasPassword !== null ? resolvedHasPassword : true;

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const pwMismatch = newPw && confirmPw && newPw !== confirmPw;
  const canSubmit = useMemo(() => {
    if (saving) return false;
    if (!newPw || newPw.length < 6) return false;
    if (pwMismatch) return false;
    if (hasPassword && !currentPw) return false;
    return true;
  }, [saving, newPw, confirmPw, pwMismatch, hasPassword, currentPw]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    try {
      await changePassword({
        currentPassword: hasPassword ? currentPw : undefined,
        newPassword: newPw,
      });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      if (user && !hasPassword) {
        setUser({ ...user, hasPassword: true });
      }
      showSuccess(hasPassword ? 'Password updated successfully.' : 'Password created successfully.');
    } catch (err: any) {
      showError(err?.message || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 text-slate-500 text-sm mb-2">
          <ShieldCheck className="h-4 w-4" />
          Account Security
        </div>
        <h1 className="text-2xl font-semibold text-ink">Password &amp; Security</h1>
        <p className="text-slate-500 mt-1">
          {hasPassword
            ? 'Change your password to keep your account secure.'
            : 'You signed in with Google. Create a password to enable email login.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-2 text-slate-700">
          <KeyRound className="h-5 w-5 text-ocean-600" />
          <h2 className="text-base font-semibold">
            {hasPassword ? 'Update password' : 'Create password'}
          </h2>
        </div>

        {hasPassword && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Current password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="Enter current password"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-300"
                autoComplete="current-password"
                disabled={saving}
              />
              <button
                type="button"
                aria-label={showCurrent ? 'Hide password' : 'Show password'}
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute inset-y-0 right-2 my-auto inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder={hasPassword ? 'Create a new password' : 'Create your password'}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-300"
              autoComplete="new-password"
              disabled={saving}
              minLength={6}
              required
            />
            <button
              type="button"
              aria-label={showNew ? 'Hide password' : 'Show password'}
              onClick={() => setShowNew((v) => !v)}
              className="absolute inset-y-0 right-2 my-auto inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Minimum 6 characters.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Confirm new password</label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-300"
              autoComplete="new-password"
              disabled={saving}
              minLength={6}
              required
            />
            <button
              type="button"
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute inset-y-0 right-2 my-auto inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {pwMismatch && (
            <p className="mt-1 text-xs text-rose-600">Passwords do not match.</p>
          )}
        </div>

        <div className="pt-2 flex items-center justify-end">
          <button
            type="submit"
            disabled={!canSubmit}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-soft
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300
              ${canSubmit ? 'bg-ocean-700 hover:bg-ocean-800' : 'bg-ocean-700/60'}`}
          >
            {saving ? 'Saving…' : hasPassword ? 'Update Password' : 'Create Password'}
          </button>
        </div>
      </form>
    </div>
  );
}
