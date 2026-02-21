// src/pages/admin/admin-controls.tsx
import { useEffect, useState } from 'react';
import {
  Settings,
  ToggleLeft,
  ToggleRight,
  Wrench,
  UserPlus,
  Shield,
  AlertTriangle,
  Check,
  X,
  Copy,
  Eye,
  EyeOff,
  Clock,
} from 'lucide-react';
import api from '../../services/apiClient';

// ─── Types ─────────────────────────────────────

interface MaintenanceBreak {
  enabled: boolean;
  message: string;
  startTime: string;
  endTime: string;
}

interface AdminControls {
  tutorRoleEnabled: boolean;
  studentRoleEnabled: boolean;
  maintenanceBreak: MaintenanceBreak | null;
}

interface AdminControlsResponse {
  controls: AdminControls;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
}

interface CreatedAdmin {
  user: { id: string; email: string; name: string; role: string };
  temporaryPassword?: string;
  note: string;
}

// ─── Component ─────────────────────────────────

export default function AdminControlsPage() {
  const [controls, setControls] = useState<AdminControls | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [lastUpdatedBy, setLastUpdatedBy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Maintenance form state
  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintMessage, setMaintMessage] = useState('We are performing scheduled maintenance. Please avoid adding availability or making bookings during this time.');
  const [maintStart, setMaintStart] = useState('');
  const [maintEnd, setMaintEnd] = useState('');

  // Create admin user state
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [createdAdmin, setCreatedAdmin] = useState<CreatedAdmin | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // ─── Load ──────

  useEffect(() => {
    loadControls();
  }, []);

  async function loadControls() {
    try {
      setLoading(true);
      const { data } = await api.get<AdminControlsResponse>('/admin-controls');
      setControls(data.controls);
      setLastUpdatedAt(data.lastUpdatedAt);
      setLastUpdatedBy(data.lastUpdatedBy);

      // Populate maintenance form
      const mb = data.controls.maintenanceBreak;
      if (mb) {
        setMaintEnabled(mb.enabled);
        setMaintMessage(mb.message || '');
        setMaintStart(mb.startTime ? toLocalDatetimeStr(mb.startTime) : '');
        setMaintEnd(mb.endTime ? toLocalDatetimeStr(mb.endTime) : '');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load admin controls');
    } finally {
      setLoading(false);
    }
  }

  // ─── Save ──────

  async function saveControls(patch: Partial<AdminControls>) {
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);
      const { data } = await api.patch('/admin-controls', patch);
      setControls(data.controls);
      setSuccessMsg('Settings saved successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  // ─── Toggle handlers ──────

  function toggleTutorRole() {
    if (!controls) return;
    const newVal = !controls.tutorRoleEnabled;
    saveControls({ tutorRoleEnabled: newVal });
  }

  function toggleStudentRole() {
    if (!controls) return;
    const newVal = !controls.studentRoleEnabled;
    saveControls({ studentRoleEnabled: newVal });
  }

  function saveMaintenance() {
    const mb: MaintenanceBreak = {
      enabled: maintEnabled,
      message: maintMessage,
      startTime: maintStart ? new Date(maintStart).toISOString() : new Date().toISOString(),
      endTime: maintEnd ? new Date(maintEnd).toISOString() : new Date(Date.now() + 3600000).toISOString(),
    };
    saveControls({ maintenanceBreak: mb });
  }

  function clearMaintenance() {
    saveControls({ maintenanceBreak: { enabled: false, message: '', startTime: new Date().toISOString(), endTime: new Date().toISOString() } });
    setMaintEnabled(false);
    setMaintMessage('');
    setMaintStart('');
    setMaintEnd('');
  }

  // ─── Create Admin ──────

  async function handleCreateAdmin() {
    try {
      setCreatingAdmin(true);
      setAdminError(null);
      setCreatedAdmin(null);
      const body: any = { email: adminEmail, name: adminName };
      if (adminPassword.trim()) body.password = adminPassword;

      const { data } = await api.post('/admin-controls/create-admin', body);
      setCreatedAdmin(data);
      setAdminEmail('');
      setAdminName('');
      setAdminPassword('');
    } catch (err: any) {
      setAdminError(err?.response?.data?.message || 'Failed to create admin user');
    } finally {
      setCreatingAdmin(false);
    }
  }

  function copyPassword() {
    if (createdAdmin?.temporaryPassword) {
      navigator.clipboard.writeText(createdAdmin.temporaryPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  }

  // ─── Helpers ──────

  function toLocalDatetimeStr(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ─── Render ──────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent" />
        <span className="ml-3 text-slate-600">Loading admin controls...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Settings className="w-8 h-8 text-indigo-600" />
          Admin Controls
        </h1>
        <p className="text-slate-600 mt-2">
          Manage platform-wide settings, role access, maintenance breaks, and admin users.
        </p>
        {lastUpdatedAt && (
          <p className="text-xs text-slate-400 mt-1">
            Last updated: {new Date(lastUpdatedAt).toLocaleString()} by {lastUpdatedBy || 'system'}
          </p>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <X className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" /> {successMsg}
        </div>
      )}

      {/* ═══ Section 1: Role Access Controls ═══ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-indigo-600" />
          Role Access Controls
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Enable or disable role selection on the "Choose Role" page. Disabled roles show a "Coming Soon" badge.
        </p>

        <div className="space-y-4">
          {/* Tutor toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div>
              <div className="font-medium text-slate-900">Tutor Registration</div>
              <div className="text-sm text-slate-500">Allow new users to register as tutors</div>
            </div>
            <button
              onClick={toggleTutorRole}
              disabled={saving}
              className={`transition-colors ${controls?.tutorRoleEnabled ? 'text-green-600' : 'text-slate-400'}`}
              title={controls?.tutorRoleEnabled ? 'Enabled – click to disable' : 'Disabled – click to enable'}
            >
              {controls?.tutorRoleEnabled ? (
                <ToggleRight className="w-10 h-10" />
              ) : (
                <ToggleLeft className="w-10 h-10" />
              )}
            </button>
          </div>

          {/* Student toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div>
              <div className="font-medium text-slate-900">Student Registration</div>
              <div className="text-sm text-slate-500">Allow new users to register as students</div>
            </div>
            <button
              onClick={toggleStudentRole}
              disabled={saving}
              className={`transition-colors ${controls?.studentRoleEnabled ? 'text-green-600' : 'text-slate-400'}`}
              title={controls?.studentRoleEnabled ? 'Enabled – click to disable' : 'Disabled – click to enable'}
            >
              {controls?.studentRoleEnabled ? (
                <ToggleRight className="w-10 h-10" />
              ) : (
                <ToggleLeft className="w-10 h-10" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ Section 2: Maintenance Break ═══ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-1">
          <Wrench className="w-5 h-5 text-amber-600" />
          Maintenance Break
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Schedule a maintenance window. Users will see a dismissible modal warning them not to add availability or make bookings.
        </p>

        <div className="space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-100">
            <div>
              <div className="font-medium text-slate-900">Maintenance Mode</div>
              <div className="text-sm text-slate-500">Show maintenance banner to all users</div>
            </div>
            <button
              onClick={() => setMaintEnabled(!maintEnabled)}
              className={`transition-colors ${maintEnabled ? 'text-amber-600' : 'text-slate-400'}`}
            >
              {maintEnabled ? (
                <ToggleRight className="w-10 h-10" />
              ) : (
                <ToggleLeft className="w-10 h-10" />
              )}
            </button>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="maint-message">
              Maintenance Message
            </label>
            <textarea
              id="maint-message"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={3}
              value={maintMessage}
              onChange={(e) => setMaintMessage(e.target.value)}
              placeholder="e.g. We are performing scheduled maintenance..."
            />
          </div>

          {/* Date/time pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Clock className="w-4 h-4 inline mr-1" /> Start Time
              </label>
              <input
                type="datetime-local"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
                value={maintStart}
                onChange={(e) => setMaintStart(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Clock className="w-4 h-4 inline mr-1" /> End Time
              </label>
              <input
                type="datetime-local"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
                value={maintEnd}
                onChange={(e) => setMaintEnd(e.target.value)}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={saveMaintenance}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Maintenance Settings'}
            </button>
            <button
              onClick={clearMaintenance}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition"
            >
              Clear / Disable
            </button>
          </div>

          {/* Current status */}
          {controls?.maintenanceBreak?.enabled && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
              <div className="flex items-center gap-2 text-amber-700 font-medium">
                <AlertTriangle className="w-4 h-4" />
                Maintenance is currently ACTIVE
              </div>
              <div className="text-amber-600 mt-1">
                {controls.maintenanceBreak.startTime && (
                  <span>From: {new Date(controls.maintenanceBreak.startTime).toLocaleString()}</span>
                )}
                {controls.maintenanceBreak.endTime && (
                  <span className="ml-4">To: {new Date(controls.maintenanceBreak.endTime).toLocaleString()}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Section 3: Create Admin User ═══ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-1">
          <UserPlus className="w-5 h-5 text-purple-600" />
          Create Admin User
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Create a new user with admin privileges. If no password is provided, a temporary one will be generated.
        </p>

        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="admin-email">Email *</label>
            <input
              id="admin-email"
              type="email"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@tunectnow.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="admin-name">Name *</label>
            <input
              id="admin-name"
              type="text"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Full Name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="admin-password">
              Password <span className="text-slate-400">(optional – leave blank for auto-generated)</span>
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm pr-10 focus:ring-2 focus:ring-indigo-500"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Min 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {adminError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {adminError}
            </div>
          )}

          <button
            onClick={handleCreateAdmin}
            disabled={creatingAdmin || !adminEmail.trim() || !adminName.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 transition disabled:opacity-50"
          >
            <UserPlus className="w-4 h-4" />
            {creatingAdmin ? 'Creating...' : 'Create Admin User'}
          </button>

          {/* Success result */}
          {createdAdmin && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                <Check className="w-4 h-4" />
                Admin user created successfully
              </div>
              <div className="text-sm text-slate-700 space-y-1">
                <div><strong>Email:</strong> {createdAdmin.user.email}</div>
                <div><strong>Name:</strong> {createdAdmin.user.name}</div>
                {createdAdmin.temporaryPassword && (
                  <div className="flex items-center gap-2">
                    <strong>Temporary Password:</strong>
                    <code className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">
                      {createdAdmin.temporaryPassword}
                    </code>
                    <button
                      onClick={copyPassword}
                      className="text-slate-500 hover:text-slate-700"
                      title="Copy password"
                    >
                      {copiedPassword ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                )}
                <div className="text-xs text-slate-500 mt-2">{createdAdmin.note}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
