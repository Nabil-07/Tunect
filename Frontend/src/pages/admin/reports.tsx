import { useState, useEffect, useCallback } from 'react';
import { Download, BarChart3, FileText, TrendingUp, CreditCard, Users, Calendar, ArrowDown } from 'lucide-react';
import { fetchDashboard, type AdminDashboard } from '../../services/adminService';
import api from '../../services/apiClient';

// ---------- Export helpers ----------
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => {
      const v = row[h];
      const s = v === null || v === undefined ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
  }
  return lines.join('\n');
}

export default function AdminReports() {
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard().then(setDashboard).catch(() => {});
  }, []);

  const gatherExportData = useCallback(async () => {
    const [bookingsRes, paymentsRes] = await Promise.all([
      api.get('/admin/bookings', { params: { page: 1, pageSize: 500 } }),
      api.get('/admin/payments', { params: { page: 1, pageSize: 500 } }),
    ]);
    return {
      bookings: (bookingsRes.data?.items ?? []) as Record<string, unknown>[],
      payments: (paymentsRes.data?.items ?? []) as Record<string, unknown>[],
      dashboard: dashboard ?? {},
    };
  }, [dashboard]);

  const handleExport = useCallback(async (format: string) => {
    setExporting(format);
    try {
      const data = await gatherExportData();

      if (format === 'CSV') {
        const bookingRows = data.bookings.map((b: any) => ({
          ID: b.id,
          Status: b.status,
          Type: b.isDemo ? 'Demo' : 'Paid',
          StartTime: b.startTime ?? '',
          EndTime: b.endTime ?? '',
          Tutor: b.tutor?.user?.email ?? '',
          Student: b.student?.user?.email ?? '',
          TokensCharged: b.tokensCharged ?? 0,
          RefundProcessed: b.refundProcessed ? 'Yes' : 'No',
        }));
        const paymentRows = data.payments.map((p: any) => ({
          ID: p.id,
          Amount: p.amountInMinor ? (Number(p.amountInMinor) / 100).toFixed(2) : '0',
          Currency: p.currency ?? 'INR',
          TokensPurchased: p.tokensPurchased ?? 0,
          Status: p.status,
          Provider: p.provider ?? '',
          Date: p.createdAt ?? '',
        }));

        const csv = '--- BOOKINGS ---\n' + toCsv(bookingRows) + '\n\n--- PAYMENTS ---\n' + toCsv(paymentRows);
        downloadFile(csv, `tunect-report-${selectedPeriod}.csv`, 'text/csv');
      } else if (format === 'JSON') {
        downloadFile(JSON.stringify(data, null, 2), `tunect-report-${selectedPeriod}.json`, 'application/json');
      } else if (format === 'PDF') {
        // Simple HTML-to-print PDF generation
        const w = window.open('', '_blank');
        if (!w) return;
        const stats = dashboard?.totals;
        w.document.write(`
          <html><head><title>Tunect Report - ${selectedPeriod}</title>
          <style>body{font-family:system-ui;padding:2rem}table{border-collapse:collapse;width:100%;margin:1rem 0}
          th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:12px}th{background:#f5f5f5}
          h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:2rem}</style></head><body>
          <h1>Tunect Platform Report (${selectedPeriod})</h1>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <h2>Summary</h2>
          <table><tr><th>Users</th><th>Tutors</th><th>Students</th><th>Bookings</th><th>Payments</th></tr>
          <tr><td>${stats?.users ?? 0}</td><td>${stats?.tutors ?? 0}</td><td>${stats?.students ?? 0}</td>
          <td>${stats?.bookings ?? 0}</td><td>${stats?.payments ?? 0}</td></tr></table>
          <h2>Bookings (${data.bookings.length})</h2>
          <table><tr><th>ID</th><th>Status</th><th>Type</th><th>Start</th><th>Tutor</th><th>Student</th><th>Tokens</th></tr>
          ${data.bookings.slice(0, 100).map((b: any) => `<tr><td>${String(b.id).slice(-8)}</td><td>${b.status}</td>
          <td>${b.isDemo ? 'Demo' : 'Paid'}</td><td>${b.startTime ? new Date(b.startTime).toLocaleDateString() : '-'}</td>
          <td>${b.tutor?.user?.email ?? '-'}</td><td>${b.student?.user?.email ?? '-'}</td>
          <td>${b.tokensCharged ?? 0}</td></tr>`).join('')}
          </table>
          <h2>Payments (${data.payments.length})</h2>
          <table><tr><th>ID</th><th>Amount</th><th>Tokens</th><th>Status</th><th>Provider</th><th>Date</th></tr>
          ${data.payments.slice(0, 100).map((p: any) => `<tr><td>${String(p.id).slice(-8)}</td>
          <td>₹${p.amountInMinor ? (Number(p.amountInMinor) / 100).toFixed(2) : '0'}</td>
          <td>${p.tokensPurchased ?? 0}</td><td>${p.status}</td><td>${p.provider ?? '-'}</td>
          <td>${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '-'}</td></tr>`).join('')}
          </table></body></html>
        `);
        w.document.close();
        w.print();
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(null);
    }
  }, [gatherExportData, selectedPeriod, dashboard]);

  const reports = [
    {
      icon: BarChart3,
      title: 'Balance Sheet',
      description: 'Complete financial statements and ledger reports',
      path: '/admin/finance/balance-sheet',
      color: 'indigo',
      restricted: true,
      badge: 'Director Only',
    },
    {
      icon: CreditCard,
      title: 'Payments & Receipts',
      description: 'Track student payments and tutor payouts with detailed breakdown',
      path: '/admin/finance/payments',
      color: 'blue',
      restricted: false,
    },
    {
      icon: TrendingUp,
      title: 'Platform Analytics',
      description: 'Revenue trends, booking metrics, and platform insights',
      path: '/admin/analytics',
      color: 'green',
      restricted: false,
    },
    {
      icon: Users,
      title: 'Student Activity Report',
      description: 'Student engagement, session history, and performance',
      path: '/admin/students',
      color: 'purple',
      restricted: false,
    },
    {
      icon: Users,
      title: 'Tutor Performance Report',
      description: 'Tutor ratings, earnings, and session metrics',
      path: '/admin/tutors',
      color: 'orange',
      restricted: false,
    },
    {
      icon: FileText,
      title: 'Refund Reports',
      description: 'Refund requests and dispute resolutions',
      path: '/admin/refund-requests',
      color: 'rose',
      restricted: false,
    },
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; border: string; icon: string; hover: string }> = {
      indigo: {
        bg: 'bg-indigo-50',
        border: 'border-indigo-200',
        icon: 'text-indigo-600',
        hover: 'hover:border-indigo-400 hover:shadow-lg',
      },
      blue: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        icon: 'text-blue-600',
        hover: 'hover:border-blue-400 hover:shadow-lg',
      },
      green: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        icon: 'text-green-600',
        hover: 'hover:border-green-400 hover:shadow-lg',
      },
      purple: {
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        icon: 'text-purple-600',
        hover: 'hover:border-purple-400 hover:shadow-lg',
      },
      orange: {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        icon: 'text-orange-600',
        hover: 'hover:border-orange-400 hover:shadow-lg',
      },
      rose: {
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        icon: 'text-rose-600',
        hover: 'hover:border-rose-400 hover:shadow-lg',
      },
    };
    return colors[color] || colors.indigo;
  };

  return (
    <div className="space-y-8" data-testid="reports-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Platform Reports</h1>
          <p className="text-slate-600 mt-2">Access comprehensive reports, analytics, and financial statements</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            data-testid="reports-period-select"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300"
          >
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="quarter">Quarterly</option>
            <option value="year">Yearly</option>
          </select>
          <button
            onClick={() => handleExport('CSV')}
            disabled={exporting !== null}
            data-testid="reports-download-all-button"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Download All
          </button>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report) => {
          const Icon = report.icon;
          const colors = getColorClasses(report.color);

          return (
            <a
              key={report.path}
              href={report.path}
              data-testid={`reports-card-${report.color}`}
              className={`rounded-2xl border-2 p-6 transition-all ${colors.border} ${colors.bg} ${colors.hover} cursor-pointer group`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl bg-white`}>
                  <Icon className={`w-6 h-6 ${colors.icon}`} />
                </div>
                <ArrowDown className={`w-5 h-5 text-slate-300 group-hover:text-slate-400 group-hover:translate-y-1 transition-transform`} />
              </div>

              <h3 className="text-lg font-semibold text-slate-900 mb-2">{report.title}</h3>
              <p className="text-sm text-slate-600 mb-4">{report.description}</p>

              {report.restricted && (
                <span className="inline-block px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-medium">
                  {report.badge}
                </span>
              )}
            </a>
          );
        })}
      </div>

      {/* Quick Stats */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold mb-6">Report Overview</h2>

        <div className="grid md:grid-cols-4 gap-4">
          {[
            { label: 'Financial Records', value: dashboard?.totals?.payments?.toLocaleString() ?? '—', icon: CreditCard },
            { label: 'Total Bookings', value: dashboard?.totals?.bookings?.toLocaleString() ?? '—', icon: Users },
            { label: 'Total Revenue', value: dashboard ? `₹${(dashboard.totals.revenueInMinor / 100).toLocaleString()}` : '—', icon: TrendingUp },
            { label: 'Last Updated', value: 'Now', icon: Calendar },
          ].map((stat) => {
            const StatIcon = stat.icon;
            return (
              <div key={stat.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-slate-600">{stat.label}</p>
                  <StatIcon className="w-4 h-4 text-slate-400" />
                </div>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Export Options */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <h2 className="text-lg font-semibold mb-4">Export Options</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { format: 'CSV', description: 'Spreadsheet format for Excel/Sheets' },
            { format: 'PDF', description: 'Formatted reports for printing' },
            { format: 'JSON', description: 'Raw data format for integrations' },
          ].map((option) => (
            <button
              key={option.format}
              onClick={() => handleExport(option.format)}
              disabled={exporting !== null}
              data-testid={`reports-export-${option.format.toLowerCase()}-button`}
              className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <p className="font-semibold text-slate-900">
                {exporting === option.format ? `Exporting ${option.format}…` : option.format}
              </p>
              <p className="text-sm text-slate-600 mt-1">{option.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}