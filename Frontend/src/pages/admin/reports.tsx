import { useState } from 'react';
import { Download, BarChart3, FileText, TrendingUp, CreditCard, Users, Calendar, ArrowDown } from 'lucide-react';

export default function AdminReports() {
  const [selectedPeriod, setSelectedPeriod] = useState('month');

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
    <div className="space-y-8">
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
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300"
          >
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="quarter">Quarterly</option>
            <option value="year">Yearly</option>
          </select>
          <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
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
            { label: 'Financial Records', value: '1,247', icon: CreditCard },
            { label: 'Student Transactions', value: '3,542', icon: Users },
            { label: 'Tutor Payouts', value: '892', icon: TrendingUp },
            { label: 'Last Updated', value: 'Today', icon: Calendar },
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
              className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:bg-slate-50 transition-colors"
            >
              <p className="font-semibold text-slate-900">{option.format}</p>
              <p className="text-sm text-slate-600 mt-1">{option.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}