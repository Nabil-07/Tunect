// src/pages/admin/dashboard.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  BookOpen,
  CreditCard,
  FileText,
  BarChart4,
  Headphones,
  BookMarked,
  GraduationCap,
  TrendingUp,
  Clock,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { fetchDashboard, type AdminDashboard } from '../../services/adminService';

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchDashboard();
        setStats(data);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const formatMoney = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <div className="text-slate-600 py-12 text-center">Loading dashboard...</div>;
  if (error) return <div className="text-rose-600 py-12 text-center">{error}</div>;
  if (!stats) return <div className="text-slate-600 py-12 text-center">No dashboard data.</div>;

  const mainActions = [
    { icon: GraduationCap, label: 'Tutors', value: stats.totals.tutors, color: 'indigo', to: '/admin/tutors', action: 'Manage' },
    { icon: Users, label: 'Students', value: stats.totals.students, color: 'blue', to: '/admin/students', action: 'Manage' },
    { icon: BookOpen, label: 'Bookings', value: stats.totals.bookings, color: 'purple', to: '/admin/reports', action: 'View' },
    { icon: CreditCard, label: 'Payments', value: stats.totals.payments, color: 'green', to: '/admin/finance', action: 'Manage' },
  ];

  const adminTools = [
    { icon: TrendingUp, label: 'Analytics', description: 'Platform insights & trends', to: '/admin/analytics', color: 'amber' },
    { icon: FileText, label: 'Refunds', description: 'Refund requests management', to: '/admin/refund-requests', color: 'orange' },
    { icon: BarChart4, label: 'Audit Log', description: 'System activity & changes', to: '/admin/audit', color: 'slate' },
    { icon: BookMarked, label: 'Blogs', description: 'Content management', to: '/admin/blogs', color: 'rose' },
    { icon: AlertCircle, label: 'KYC Verification', description: 'Review tutor documents', to: '/admin/kyc-verification', color: 'red', badge: stats.pendingKyc > 0 ? stats.pendingKyc : undefined },
    { icon: Headphones, label: 'Support', description: 'Customer support portal', to: '/support', color: 'cyan' },
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; text: string; border: string; icon: string }> = {
      indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: 'text-indigo-600' },
      blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: 'text-blue-600' },
      purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: 'text-purple-600' },
      green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: 'text-green-600' },
      amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: 'text-amber-600' },
      orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: 'text-orange-600' },
      slate: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', icon: 'text-slate-600' },
      rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: 'text-rose-600' },
      red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: 'text-red-600' },
      cyan: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', icon: 'text-cyan-600' },
    };
    return colors[color] || colors.indigo;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="text-slate-600 mt-2">Manage platform, tutors, students, and payments</p>
      </div>

      {/* Key Metrics */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Key Metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-3xl font-bold text-slate-900">{stats.totals.users}</div>
            <div className="text-sm text-slate-600 mt-1">Total Users</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-3xl font-bold text-slate-900">{formatMoney(stats.totals.revenueInMinor)}</div>
            <div className="text-sm text-slate-600 mt-1">Revenue</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-3xl font-bold text-indigo-600">{stats.pendingKyc}</div>
            <div className="text-sm text-slate-600 mt-1">KYC Pending</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-3xl font-bold text-slate-900">{stats.latestSignups.length}</div>
            <div className="text-sm text-slate-600 mt-1">Recent Signups</div>
          </div>
        </div>
      </div>

      {/* Quick Access - Main Actions */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {mainActions.map((action) => {
            const Icon = action.icon;
            const colors = getColorClasses(action.color);
            return (
              <Link
                key={action.label}
                to={action.to}
                className={`${colors.bg} ${colors.border} border rounded-2xl p-6 hover:shadow-md transition-all group`}
              >
                <div className="flex items-start justify-between mb-3">
                  <Icon className={`${colors.icon} w-8 h-8`} />
                  <ArrowRight className={`${colors.icon} w-5 h-5 opacity-0 group-hover:opacity-100 transition`} />
                </div>
                <div className="text-2xl font-bold text-slate-900">{action.value}</div>
                <div className="text-sm text-slate-600 mt-2">{action.label}</div>
                <div className={`text-xs font-semibold ${colors.text} mt-3 inline-block`}>{action.action} →</div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Admin Tools Grid */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Admin Tools & Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {adminTools.map((tool) => {
            const Icon = tool.icon;
            const colors = getColorClasses(tool.color);
            return (
              <Link
                key={tool.label}
                to={tool.to}
                className={`${colors.bg} ${colors.border} border rounded-xl p-4 hover:shadow-md transition-all group`}
              >
                <div className="flex items-start justify-between mb-2">
                  <Icon className={`${colors.icon} w-6 h-6`} />
                  {tool.badge && (
                    <span className="bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                      {tool.badge}
                    </span>
                  )}
                </div>
                <div className="font-semibold text-slate-900">{tool.label}</div>
                <div className="text-sm text-slate-600 mt-1">{tool.description}</div>
                <div className={`text-xs font-semibold ${colors.text} mt-3 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition`}>
                  Open <ArrowRight className="w-3 h-3" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Latest Signups Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">Recent Signups</h2>
          </div>
          <span className="text-xs text-slate-500">{stats.latestSignups.length} total</span>
        </div>
        {stats.latestSignups.length > 0 ? (
          <div className="space-y-2">
            {stats.latestSignups.slice(0, 6).map((u) => (
              <div key={u.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition">
                <div className="flex-1">
                  <div className="font-semibold text-slate-900 text-sm">{u.email}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{new Date(u.createdAt).toLocaleDateString()}</div>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  u.role === 'STUDENT' ? 'bg-blue-100 text-blue-700' :
                  u.role === 'TUTOR' ? 'bg-indigo-100 text-indigo-700' :
                  'bg-purple-100 text-purple-700'
                }`}>
                  {u.role}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No recent signups</p>
          </div>
        )}
      </div>
    </div>
  );
}
