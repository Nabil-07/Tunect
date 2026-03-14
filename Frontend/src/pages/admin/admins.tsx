// src/pages/admin/admins.tsx
import { useEffect, useState } from 'react';
import {
  Shield, UserPlus, Crown, Search, Check, X, Copy, Eye, EyeOff,
  ToggleLeft, ToggleRight, AlertTriangle, Trash2,
} from 'lucide-react';
import api from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isDirector: boolean;
  createdAt: string;
}

interface CreatedAdmin {
  user: { id: string; email: string; name: string; role: string };
  temporaryPassword?: string;
  note: string;
}

export default function AdminManagement() {
  const { user } = useAuth();
  const isDirector = !!user?.isDirector;

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create admin form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [createdAdmin, setCreatedAdmin] = useState<CreatedAdmin | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [togglingDirector, setTogglingDirector] = useState<string | null>(null);
  const [deletingAdmin, setDeletingAdmin] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  useEffect(() => {
    loadAdmins();
  }, []);

  async function loadAdmins() {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/admin/admin-users', { params: { page: 1, pageSize: 200, q: search || undefined } });
      setAdmins(data?.items || []);
    } catch (err: any) {
      // Fallback: just list from users endpoint
      try {
        const { data } = await api.get('/admin/users', { params: { page: 1, pageSize: 200 } });
        const items = data?.items || [];
        setAdmins(items.filter((u: any) => u.role === 'ADMIN').map((u: any) => ({ ...u, isDirector: false })));
      } catch {
        setError('Failed to load admin users');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAdmin() {
    try {
      setCreatingAdmin(true);
      setError(null);
      setCreatedAdmin(null);
      const body: any = { email: adminEmail, name: adminName };
      if (adminPassword.trim()) body.password = adminPassword;

      const { data } = await api.post('/admin-controls/create-admin', body);
      setCreatedAdmin(data);
      setAdminEmail('');
      setAdminName('');
      setAdminPassword('');
      setSuccessMsg('Admin user created successfully');
      setTimeout(() => setSuccessMsg(null), 4000);
      await loadAdmins();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create admin user');
    } finally {
      setCreatingAdmin(false);
    }
  }

  async function toggleDirector(userId: string, currentIsDirector: boolean) {
    if (!isDirector) return;
    try {
      setTogglingDirector(userId);
      setError(null);
      await api.patch(`/admin/admin-users/${userId}/director`, {
        isDirector: !currentIsDirector,
      });
      setSuccessMsg(`Director access ${!currentIsDirector ? 'granted' : 'revoked'} successfully`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setAdmins((prev) =>
        prev.map((a) => (a.id === userId ? { ...a, isDirector: !currentIsDirector } : a)),
      );
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update director access');
    } finally {
      setTogglingDirector(null);
    }
  }

  function deleteAdminUser(target: AdminUser) {
    // Directors can delete anyone (except self/last director); regular admins can only delete non-directors
    if (target.isDirector && !isDirector) {
      setError('Only directors can delete director accounts');
      return;
    }
    setConfirmDelete(target);
  }

  async function confirmDeleteAdmin() {
    if (!confirmDelete) return;
    try {
      setDeletingAdmin(confirmDelete.id);
      setError(null);
      await api.delete(`/admin/admin-users/${confirmDelete.id}`);
      setSuccessMsg('Admin user deleted successfully');
      setTimeout(() => setSuccessMsg(null), 4000);
      setAdmins((prev) => prev.filter((a) => a.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete admin user');
    } finally {
      setDeletingAdmin(null);
    }
  }

  function copyPassword() {
    if (createdAdmin?.temporaryPassword) {
      navigator.clipboard.writeText(createdAdmin.temporaryPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  }

  const filteredAdmins = admins.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.email.toLowerCase().includes(q) ||
      (a.name || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent" />
        <span className="ml-3 text-slate-600">Loading admin users...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admins-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Shield className="w-8 h-8 text-indigo-600" />
            Admin Users
          </h1>
          <p className="text-slate-600 mt-1">
            Manage admin user accounts and director access
          </p>
        </div>
        {isDirector && (
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            data-testid="admins-create-admin-button"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition"
          >
            <UserPlus className="w-4 h-4" />
            Create Admin
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2" data-testid="admins-error-alert">
          <X className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2" data-testid="admins-success-alert">
          <Check className="w-4 h-4 shrink-0" /> {successMsg}
        </div>
      )}

      {/* Create Admin Form - Director Only */}
      {isDirector && showCreateForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <UserPlus className="w-5 h-5 text-purple-600" />
            Create New Admin User
          </h2>
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
              <input
                type="email"
                data-testid="admins-email-input"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@tunectnow.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
              <input
                type="text"
                data-testid="admins-name-input"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Full Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password <span className="text-slate-400">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  data-testid="admins-password-input"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm pr-10 focus:ring-2 focus:ring-indigo-500"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Min 8 characters (auto-generated if blank)"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="admins-toggle-password-button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              onClick={handleCreateAdmin}
              disabled={creatingAdmin || !adminEmail.trim() || !adminName.trim()}
              data-testid="admins-create-submit-button"
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 transition disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              {creatingAdmin ? 'Creating...' : 'Create Admin User'}
            </button>

            {createdAdmin && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                  <Check className="w-4 h-4" />
                  Admin user created
                </div>
                <div className="text-sm text-slate-700 space-y-1">
                  <div><strong>Email:</strong> {createdAdmin.user.email}</div>
                  <div><strong>Name:</strong> {createdAdmin.user.name}</div>
                  {createdAdmin.temporaryPassword && (
                    <div className="flex items-center gap-2">
                      <strong>Temp Password:</strong>
                      <code className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">
                        {createdAdmin.temporaryPassword}
                      </code>
                      <button onClick={copyPassword} data-testid="admins-copy-password-button" className="text-slate-500 hover:text-slate-700">
                        {copiedPassword ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          data-testid="admins-search-input"
          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Admin List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-900">{filteredAdmins.length} Admin{filteredAdmins.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {filteredAdmins.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No admin users found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredAdmins.map((admin) => (
              <div key={admin.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm">
                    {(admin.name || admin.email).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                      {admin.name || 'Unnamed'}
                      {admin.isDirector && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                          <Crown className="w-3 h-3" />
                          Director
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{admin.email}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Joined: {new Date(admin.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 min-w-[220px]">
                  {isDirector && admin.id !== user?.id && (
                    <button
                      onClick={() => toggleDirector(admin.id, admin.isDirector)}
                      disabled={togglingDirector === admin.id}
                      data-testid={`admins-director-toggle-${admin.id}`}
                      className={`transition-colors ${admin.isDirector ? 'text-amber-600' : 'text-slate-400'} ${togglingDirector === admin.id ? 'opacity-50' : ''}`}
                      title={admin.isDirector ? 'Revoke director access' : 'Grant director access'}
                    >
                      {admin.isDirector ? (
                        <ToggleRight className="w-8 h-8" />
                      ) : (
                        <ToggleLeft className="w-8 h-8" />
                      )}
                    </button>
                  )}

                  {admin.id !== user?.id && (
                    <button
                      onClick={() => deleteAdminUser(admin)}
                      disabled={deletingAdmin === admin.id}
                      data-testid={`admins-delete-${admin.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      title="Delete admin user"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deletingAdmin === admin.id ? 'Deleting...' : 'Delete'}
                    </button>
                  )}

                  <div className="w-14 text-right text-xs text-slate-400 italic">
                    {admin.isDirector ? 'Director' : 'Admin'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isDirector && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-amber-800">Director Access Required</div>
            <div className="text-sm text-amber-700 mt-1">
              Only director admins can create new admin accounts and manage director access.
              Contact a director admin for these actions.
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            data-testid="admins-delete-modal-backdrop"
            onClick={() => setConfirmDelete(null)}
          />
          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-xl border border-slate-200 p-6" data-testid="admins-delete-modal">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Delete Admin Account</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Are you sure you want to delete{' '}
                  <span className="font-medium text-slate-800">
                    {confirmDelete.name || confirmDelete.email}
                  </span>
                  ? This will permanently deactivate their login access.
                </p>
                {confirmDelete.email && confirmDelete.name && (
                  <p className="mt-1 text-xs text-slate-400">{confirmDelete.email}</p>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deletingAdmin === confirmDelete.id}
                data-testid="admins-delete-cancel-button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAdmin}
                disabled={deletingAdmin === confirmDelete.id}
                data-testid="admins-delete-confirm-button"
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {deletingAdmin === confirmDelete.id ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
