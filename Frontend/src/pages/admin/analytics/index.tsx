import { Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';

export default function AdminAnalytics() {
  const { user } = useAuth();
  const isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics</h2>
          <p className="text-slate-600 text-sm">Conversion, earnings, and balance sheet (director-only).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/admin/dashboard" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow">
          <div className="text-sm text-slate-500">Demo → Paid conversion</div>
          <div className="text-lg font-semibold text-slate-900">View on dashboard</div>
          <div className="text-xs text-slate-500 mt-1">Click to review funnel metrics.</div>
        </Link>
        <Link to="/admin/finance" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow">
          <div className="text-sm text-slate-500">Balance Sheet</div>
          <div className="text-lg font-semibold text-slate-900">Director-only</div>
          <div className="text-xs text-slate-500 mt-1">Cash vs liabilities with ledger drilldown.</div>
        </Link>
        <Link to="/admin/finance/payouts" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow">
          <div className="text-sm text-slate-500">Money to disburse</div>
          <div className="text-lg font-semibold text-slate-900">Payout dashboard</div>
          <div className="text-xs text-slate-500 mt-1">See per-tutor payable amounts.</div>
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm text-slate-500">Director balance sheet</div>
            <div className="text-lg font-semibold">Access control</div>
          </div>
          <Link to="/admin/finance" className="text-indigo-600 text-sm font-semibold">Open</Link>
        </div>
        {isAdmin ? (
          <p className="text-sm text-slate-700">
            Only directors may view the balance sheet. Values must be derived from ledgers (no manual override).
          </p>
        ) : (
          <p className="text-sm text-rose-600">You do not have access to the balance sheet.</p>
        )}
      </div>
    </div>
  );
}
