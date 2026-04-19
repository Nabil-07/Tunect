import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Wallet,
  BadgeDollarSign,
  Building2,
  Crown,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Line,
  AreaChart,
  Area,
} from 'recharts';
import { http as api } from '../../api/http';

/* ═══════ Types ═══════ */
interface RevenueData {
  totalRevenue: number;
  companyProfit: number;
  tutorPayable: {
    total: number;
    tutors: { tutorId: string; email: string; amountPayable: number }[];
  };
  tutorPaid: {
    total: number;
    payouts: { tutorId: string; email: string; amount: number; paidDate: string | null; mode: string }[];
  };
  bracketBreakdown: {
    bracket25: { revenue: number; count: number };
    bracket22: { revenue: number; count: number };
    bracket18: { revenue: number; count: number };
  };
  highPerformers: {
    tutorId: string;
    email: string;
    commissionGenerated: number;
    bookingCount: number;
    bracket: number;
  }[];
  monthlyTrend: {
    month: string;
    revenue: number;
    commission: number;
    tutorEarnings: number;
  }[];
}

/* ═══════ Helpers ═══════ */
const fmt = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const COLORS = {
  profit: '#6366f1',
  tutorPayable: '#f59e0b',
  tutorPaid: '#10b981',
  bracket25: '#ef4444',
  bracket22: '#f59e0b',
  bracket18: '#10b981',
};

const PIE_COLORS = ['#6366f1', '#f59e0b', '#10b981'];
const BRACKET_COLORS = ['#ef4444', '#f59e0b', '#10b981'];

export default function AdminRevenue() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState('');
  const [showPayable, setShowPayable] = useState(false);
  const [showPaid, setShowPaid] = useState(false);

  const load = async (m?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await api.get('/admin/revenue', { params: m ? { month: m } : {} });
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load revenue data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(month || undefined);
  }, [month]);

  if (loading)
    return <div className="text-slate-600 py-12 text-center">Loading revenue analytics...</div>;
  if (error)
    return <div className="text-rose-600 py-12 text-center">{error}</div>;
  if (!data)
    return <div className="text-slate-600 py-12 text-center">No revenue data available.</div>;

  /* Pie data: revenue split */
  const pieData = [
    { name: "Tunect's Earnings", value: data.companyProfit },
    { name: 'Tutor Payable', value: data.tutorPayable.total },
    { name: 'Tutor Paid', value: data.tutorPaid.total },
  ].filter((d) => d.value > 0);

  /* Bracket pie data */
  const bracketPieData = [
    { name: '25% Bracket', value: data.bracketBreakdown.bracket25.revenue, count: data.bracketBreakdown.bracket25.count },
    { name: '22% Bracket', value: data.bracketBreakdown.bracket22.revenue, count: data.bracketBreakdown.bracket22.count },
    { name: '18% Bracket', value: data.bracketBreakdown.bracket18.revenue, count: data.bracketBreakdown.bracket18.count },
  ].filter((d) => d.value > 0);

  /* Month options for filter */
  const monthOptions: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    monthOptions.push({ value: val, label });
  }

  return (
    <div className="space-y-8" data-testid="revenue-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/dashboard"
            className="p-2 rounded-lg hover:bg-slate-100 transition"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Revenue Analytics</h1>
            <p className="text-slate-500 text-sm mt-1">
              Detailed breakdown of platform revenue, tutor payouts, and company earnings
            </p>
          </div>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">All Time</option>
          {monthOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* ═══════ Summary Cards ═══════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<BadgeDollarSign className="w-6 h-6 text-indigo-600" />}
          label="Total Revenue Collected"
          value={fmt(data.totalRevenue)}
          color="indigo"
          subtitle="Sum of all succeeded payments"
        />
        <SummaryCard
          icon={<Wallet className="w-6 h-6 text-amber-600" />}
          label="Tutor Payable"
          value={fmt(data.tutorPayable.total)}
          color="amber"
          subtitle="Amount owed to tutors"
        />
        <SummaryCard
          icon={<TrendingUp className="w-6 h-6 text-emerald-600" />}
          label="Tutor Paid"
          value={fmt(data.tutorPaid.total)}
          color="emerald"
          subtitle="Already paid to tutors"
        />
        <SummaryCard
          icon={<Building2 className="w-6 h-6 text-purple-600" />}
          label="Tunect's Earnings"
          value={fmt(data.companyProfit)}
          color="purple"
          subtitle="Platform commission"
        />
      </div>

      {/* ═══════ Revenue Split Pie Chart ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Revenue Split</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={110}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name}: ${((percent ?? 0) * 100).toFixed(1)}%`
                  }
                  labelLine
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: any) => fmt(Number(val))} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-slate-400 text-center py-12">No data to display</div>
          )}
          <div className="flex justify-center gap-6 mt-4">
            {pieData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                <span className="text-slate-600">{d.name}: {fmt(d.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bracket Breakdown Pie Chart */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Commission by Bracket
          </h2>
          {bracketPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={bracketPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={110}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name}: ${((percent ?? 0) * 100).toFixed(1)}%`
                  }
                  labelLine
                >
                  {bracketPieData.map((_, i) => (
                    <Cell key={i} fill={BRACKET_COLORS[i % BRACKET_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any, _name: any, entry: any) =>
                    [`${fmt(Number(val))} (${entry.payload.count} sessions)`, entry.payload.name]
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-slate-400 text-center py-12">No data to display</div>
          )}
          <div className="flex justify-center gap-4 mt-4 flex-wrap">
            {bracketPieData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: BRACKET_COLORS[i % BRACKET_COLORS.length] }}
                />
                <span className="text-slate-600">
                  {d.name}: {fmt(d.value)} ({d.count} sessions)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════ Monthly Revenue Trend ═══════ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Monthly Revenue Trend (Last 12 Months)
        </h2>
        {data.monthlyTrend.some((m) => m.revenue > 0) ? (
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={data.monthlyTrend}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCommission" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => {
                  const [y, m] = v.split('-');
                  return new Date(+y, +m - 1).toLocaleString('en', { month: 'short' });
                }}
              />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${v}`} />
              <Tooltip formatter={(val: any) => fmt(Number(val))} />
              <Legend />
              <Area
                type="monotone"
                dataKey="revenue"
                name="Total Revenue"
                stroke="#6366f1"
                fill="url(#colorRevenue)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="commission"
                name="Tunect Commission"
                stroke="#10b981"
                fill="url(#colorCommission)"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="tutorEarnings"
                name="Tutor Earnings"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-slate-400 text-center py-12">No monthly data to display</div>
        )}
      </div>

      {/* ═══════ Bracket Revenue Bar Chart ═══════ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Bracket Dominance Analysis
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={[
              {
                name: '25% (₹0-399/hr)',
                commission: data.bracketBreakdown.bracket25.revenue,
                sessions: data.bracketBreakdown.bracket25.count,
              },
              {
                name: '22% (₹400-699/hr)',
                commission: data.bracketBreakdown.bracket22.revenue,
                sessions: data.bracketBreakdown.bracket22.count,
              },
              {
                name: '18% (₹700+/hr)',
                commission: data.bracketBreakdown.bracket18.revenue,
                sessions: data.bracketBreakdown.bracket18.count,
              },
            ]}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${v}`} />
            <Tooltip
              formatter={(val: any, name: any) => [
                name === 'sessions' ? val : fmt(Number(val)),
                name === 'sessions' ? 'Sessions' : 'Commission',
              ]}
            />
            <Legend />
            <Bar dataKey="commission" name="Commission Earned" radius={[6, 6, 0, 0]}>
              {[COLORS.bracket25, COLORS.bracket22, COLORS.bracket18].map((color, i) => (
                <Cell key={i} fill={color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ═══════ Tutor Payable (Expandable) ═══════ */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setShowPayable(!showPayable)}
          className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition text-left"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-amber-600" />
              Tutor Payable — {fmt(data.tutorPayable.total)}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Amount currently with the company, owed to tutors ({data.tutorPayable.tutors.length}{' '}
              tutors)
            </p>
          </div>
          {showPayable ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>
        {showPayable && data.tutorPayable.tutors.length > 0 && (
          <div className="border-t border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-slate-600">#</th>
                  <th className="text-left px-6 py-3 font-medium text-slate-600">Tutor</th>
                  <th className="text-right px-6 py-3 font-medium text-slate-600">
                    Amount Payable
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.tutorPayable.tutors.map((t, i) => (
                  <tr key={t.tutorId} className="hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-500">{i + 1}</td>
                    <td className="px-6 py-3 text-slate-800">{t.email}</td>
                    <td className="px-6 py-3 text-right font-medium text-amber-700">
                      {fmt(t.amountPayable)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showPayable && data.tutorPayable.tutors.length === 0 && (
          <div className="border-t border-slate-200 p-6 text-center text-slate-400">
            No outstanding payables
          </div>
        )}
      </div>

      {/* ═══════ Tutor Paid (Expandable) ═══════ */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setShowPaid(!showPaid)}
          className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition text-left"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Tutor Paid — {fmt(data.tutorPaid.total)}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Payouts completed ({data.tutorPaid.payouts.length} transactions)
            </p>
          </div>
          {showPaid ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>
        {showPaid && data.tutorPaid.payouts.length > 0 && (
          <div className="border-t border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-slate-600">#</th>
                  <th className="text-left px-6 py-3 font-medium text-slate-600">Tutor</th>
                  <th className="text-right px-6 py-3 font-medium text-slate-600">Amount</th>
                  <th className="text-left px-6 py-3 font-medium text-slate-600">Paid Date</th>
                  <th className="text-left px-6 py-3 font-medium text-slate-600">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.tutorPaid.payouts.map((p, i) => (
                  <tr key={`${p.tutorId}-${i}`} className="hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-500">{i + 1}</td>
                    <td className="px-6 py-3 text-slate-800">{p.email}</td>
                    <td className="px-6 py-3 text-right font-medium text-emerald-700">
                      {fmt(p.amount)}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {p.paidDate
                        ? new Date(p.paidDate).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{p.mode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showPaid && data.tutorPaid.payouts.length === 0 && (
          <div className="border-t border-slate-200 p-6 text-center text-slate-400">
            No payouts completed yet
          </div>
        )}
      </div>

      {/* ═══════ High Performing Tutors ═══════ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Crown className="w-5 h-5 text-amber-500" />
          High Performing Tutors (by Commission Generated)
        </h2>
        {data.highPerformers.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={data.highPerformers.map((t) => ({
                  name: t.email.split('@')[0],
                  commission: t.commissionGenerated,
                  sessions: t.bookingCount,
                }))}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${v}`} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(val: any, name: any) => [
                    name === 'sessions' ? val : fmt(Number(val)),
                    name === 'sessions' ? 'Sessions' : 'Commission',
                  ]}
                />
                <Legend />
                <Bar dataKey="commission" name="Commission" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Rank</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Tutor</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Commission</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Sessions</th>
                    <th className="text-center px-4 py-2 font-medium text-slate-600">Bracket</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.highPerformers.map((t, i) => (
                    <tr key={t.tutorId} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </td>
                      <td className="px-4 py-2 text-slate-800">{t.email}</td>
                      <td className="px-4 py-2 text-right font-semibold text-indigo-700">
                        {fmt(t.commissionGenerated)}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">{t.bookingCount}</td>
                      <td className="px-4 py-2 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                            t.bracket === 25
                              ? 'bg-red-100 text-red-700'
                              : t.bracket === 22
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {t.bracket}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-slate-400 text-center py-8">No high performer data available</div>
        )}
      </div>
    </div>
  );
}

/* ═══════ Summary Card Component ═══════ */
function SummaryCard({
  icon,
  label,
  value,
  color,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  subtitle: string;
}) {
  const bg: Record<string, string> = {
    indigo: 'bg-indigo-50 border-indigo-200',
    amber: 'bg-amber-50 border-amber-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    purple: 'bg-purple-50 border-purple-200',
  };

  return (
    <div className={`rounded-2xl border p-5 ${bg[color] || bg.indigo}`}>
      <div className="flex items-center gap-3 mb-2">{icon}</div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-sm font-medium text-slate-700 mt-1">{label}</div>
      <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
    </div>
  );
}
