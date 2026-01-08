// src/pages/admin/dashboard.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

  if (loading) return <div className="text-slate-600">Loading dashboard...</div>;
  if (error) return <div className="text-rose-600">{error}</div>;
  if (!stats) return <div className="text-slate-600">No dashboard data.</div>;

  const kpiCards = [
    { label: 'Users', value: stats.totals.users, sub: 'Total accounts', to: '/admin/students' },
    { label: 'Tutors', value: stats.totals.tutors, sub: 'Tutor records', to: '/admin/tutors' },
    { label: 'Students', value: stats.totals.students, sub: 'Student records', to: '/admin/students' },
    { label: 'Bookings', value: stats.totals.bookings, sub: 'All bookings', to: '/admin/reports' },
    { label: 'Payments', value: stats.totals.payments, sub: 'Total payments', to: '/admin/finance' },
    { label: 'Revenue', value: formatMoney(stats.totals.revenueInMinor), sub: 'Succeeded payments', to: '/admin/finance' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Admin Dashboard</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((k) => (
          <Link
            key={k.label}
            to={k.to || '/admin/dashboard'}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow"
          >
            <div className="text-sm text-slate-500">{k.label}</div>
            <div className="text-2xl font-semibold text-slate-900">{k.value}</div>
            <div className="text-xs text-slate-500 mt-1">{k.sub}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Link to="/admin/kyc-verification" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-200 hover:shadow">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-slate-500">KYC pending</div>
              <div className="text-lg font-semibold">Awaiting review</div>
            </div>
            <div className="text-2xl font-semibold text-indigo-600">{stats.pendingKyc}</div>
          </div>
          <p className="text-sm text-slate-600">Review documents to move tutors forward.</p>
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">Latest signups</div>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            {stats.latestSignups.slice(0, 5).map((u) => (
              <div key={u.id} className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{u.email}</div>
                  <div className="text-xs text-slate-500">{u.role}</div>
                </div>
                <div className="text-xs text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</div>
              </div>
            ))}
            {stats.latestSignups.length === 0 && <div className="text-xs text-slate-500">No recent signups.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
