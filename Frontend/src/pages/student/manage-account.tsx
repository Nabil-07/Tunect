// src/pages/student/manage-account.tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { updateMe } from '../../services/authService';
import { User, Settings, DollarSign, Save, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { http } from '../../api/http';

const CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee (₹)', symbol: '₹' },
  { code: 'USD', name: 'US Dollar ($)', symbol: '$' },
  { code: 'EUR', name: 'Euro (€)', symbol: '€' },
  { code: 'GBP', name: 'British Pound (£)', symbol: '£' },
  { code: 'AED', name: 'UAE Dirham (د.إ)', symbol: 'د.إ' },
  { code: 'AUD', name: 'Australian Dollar (A$)', symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar (C$)', symbol: 'C$' },
  { code: 'SGD', name: 'Singapore Dollar (S$)', symbol: 'S$' },
];

export default function StudentManageAccount() {
  const { user, setUser } = useAuth() as any;
  const { showSuccess, showError } = useToast();
  const [name, setName] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState('INR');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPreferredCurrency(user.preferredCurrency || 'INR');
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateMe({ name, preferredCurrency });
      setUser(updated);
      showSuccess('Account settings updated successfully!');
    } catch (error: any) {
      showError(error.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl" data-testid="student-manage-account-page">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
          <Settings className="h-8 w-8 text-blue-600" />
          Manage Account
        </h1>
        <p className="text-slate-600 mt-2">Update your personal information and preferences</p>
      </div>

      <div className="grid gap-6">
        {/* Profile Information */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            Profile Information
          </h2>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your full name"
                data-testid="student-manage-account-name-input"
              />
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-slate-500 cursor-not-allowed"
                data-testid="student-manage-account-email-input"
              />
              <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
            </div>

            {/* Phone (read-only if exists) */}
            {user?.phone && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={user?.phone || ''}
                  disabled
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-slate-500 cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 mt-1">Phone number cannot be changed</p>
              </div>
            )}
          </div>
        </section>

        {/* Currency Preferences */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            Currency Preferences
          </h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Preferred Display Currency
            </label>
            <select
              value={preferredCurrency}
              onChange={(e) => setPreferredCurrency(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="student-manage-account-currency-select"
            >
              {CURRENCIES.map((curr) => (
                <option key={curr.code} value={curr.code}>
                  {curr.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              All prices will be displayed in your preferred currency. Actual payments are processed in INR.
            </p>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="student-manage-account-save-btn"
          >
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                Save Changes
              </>
            )}
          </button>
        </div>

        {/* Account Info */}
        <section className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Account Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Account Type:</span>
              <span className="ml-2 font-medium text-slate-800">Student</span>
            </div>
            <div>
              <span className="text-slate-500">Member Since:</span>
              <span className="ml-2 font-medium text-slate-800">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">User ID:</span>
              <span className="ml-2 font-mono text-xs text-slate-600 break-all">{user?.id}</span>
            </div>
          </div>
        </section>

        {/* Danger Zone - Delete Account */}
        <section className="bg-red-50 rounded-2xl border-2 border-red-200 p-6">
          <h2 className="text-xl font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Danger Zone
          </h2>
          <p className="text-sm text-red-700 mb-4">
            Deleting your account is permanent and cannot be undone. Your personal information will be removed,
            but transactional records (bookings, payments) will be preserved for security and compliance.
          </p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
              data-testid="student-manage-account-delete-btn"
            >
              <Trash2 className="h-4 w-4" />
              Delete My Account
            </button>
          ) : (
            <div className="bg-white rounded-lg border border-red-300 p-4 space-y-3">
              <p className="text-sm font-semibold text-red-800">
                Are you absolutely sure? This action cannot be reversed.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Enter your password to confirm
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full rounded-lg border border-red-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Your current password"
                  data-testid="student-manage-account-delete-password-input"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await http.delete('/users/me', { data: { password: deletePassword } });
                      showSuccess('Account deleted successfully. You will be logged out.');
                      setTimeout(() => {
                        localStorage.clear();
                        window.location.href = '/';
                      }, 2000);
                    } catch (err: any) {
                      showError(err.response?.data?.message || 'Failed to delete account');
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  disabled={deleting}
                  className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  data-testid="student-manage-account-confirm-delete-btn"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {deleting ? 'Deleting...' : 'Yes, Delete My Account'}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                  data-testid="student-manage-account-cancel-delete-btn"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
