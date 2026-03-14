import { useEffect, useState } from 'react';
import {
  getTutorWalletLedger,
  type TutorWalletLedgerEntry,
} from '../../../services/financeService';
import { IndianRupee, Calendar, Users, Clock, Download, Filter, X } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';

// Date helpers to replace date-fns
function formatDate(date: Date, formatStr: string): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[date.getMonth()];
  
  if (formatStr === 'yyyy-MM-dd') {
    return `${year}-${month}-${day}`;
  }
  if (formatStr === 'yyyy-MM-dd HH:mm') {
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
  if (formatStr === 'MMM dd, yyyy') {
    return `${monthName} ${day}, ${year}`;
  }
  if (formatStr === 'MMM dd') {
    return `${monthName} ${day}`;
  }
  return date.toLocaleDateString();
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  return new Date(d.setDate(diff));
}

function getEndOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() + (day === 0 ? 0 : 7 - day);
  return new Date(d.setDate(diff));
}

export default function PayoutDashboard() {
  const { showError } = useToast();
  const [entries, setEntries] = useState<TutorWalletLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    tutorId: '',
    startDate: formatDate(getStartOfWeek(new Date()), 'yyyy-MM-dd'),
    endDate: formatDate(getEndOfWeek(new Date()), 'yyyy-MM-dd'),
    reason: '',
  });

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    try {
      setLoading(true);
      const data = await getTutorWalletLedger({
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        reason: filters.reason || undefined,
      });
      setEntries(data);
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to load payout data');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  async function applyFilters() {
    loadEntries();
    setFilterOpen(false);
  }

  function exportToCSV() {
    const headers = [
      'Date',
      'Tutor Name',
      'Tutor Email',
      'Booking ID',
      'Subject',
      'Session Type',
      'Amount',
      'Reason',
      'Note',
    ];

    const rows = entries.map((entry) => [
      formatDate(new Date(entry.createdAt), 'yyyy-MM-dd HH:mm'),
      entry.tutor?.name || '',
      entry.tutor?.email || '',
      entry.bookingId || '',
      entry.booking?.subject || '',
      entry.booking?.isGroupSession ? 'Group' : '1:1',
      entry.delta,
      entry.reason,
      entry.note || '',
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payouts-${formatDate(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Group entries by tutor
  const groupedByTutor = entries.reduce((acc, entry) => {
    const tutorId = entry.tutorId;
    if (!acc[tutorId]) {
      acc[tutorId] = {
        tutorName: entry.tutor?.name || 'Unknown',
        tutorEmail: entry.tutor?.email || '',
        total: 0,
        entries: [],
      };
    }
    acc[tutorId].total += Number(entry.delta);
    acc[tutorId].entries.push(entry);
    return acc;
  }, {} as Record<string, { tutorName: string; tutorEmail: string; total: number; entries: TutorWalletLedgerEntry[] }>);

  const totalPayout = entries.reduce((sum, entry) => sum + Number(entry.delta), 0);

  return (
    <div className="max-w-7xl mx-auto p-6" data-testid="payout-dashboard-page">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Tutor Payout Dashboard</h1>
        <p className="text-slate-600">
          Track tutor earnings with detailed breakdown by student token prices
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <IndianRupee className="h-8 w-8" />
            <span className="text-sm opacity-90">Total Payout</span>
          </div>
          <div className="text-3xl font-bold">₹{totalPayout.toFixed(2)}</div>
          <p className="text-sm opacity-90 mt-1">This period</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <Users className="h-8 w-8" />
            <span className="text-sm opacity-90">Tutors</span>
          </div>
          <div className="text-3xl font-bold">{Object.keys(groupedByTutor).length}</div>
          <p className="text-sm opacity-90 mt-1">Earning this period</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <Clock className="h-8 w-8" />
            <span className="text-sm opacity-90">Transactions</span>
          </div>
          <div className="text-3xl font-bold">{entries.length}</div>
          <p className="text-sm opacity-90 mt-1">Total entries</p>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          data-testid="payout-dashboard-filters-button"
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <Filter className="h-4 w-4" />
          Filters
        </button>
        <button
          onClick={exportToCSV}
          data-testid="payout-dashboard-export-button"
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Filter Panel */}
      {filterOpen && (
        <div className="mb-6 bg-white border border-slate-200 rounded-lg p-6" data-testid="payout-dashboard-filter-panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Filter Payouts</h3>
            <button onClick={() => setFilterOpen(false)}>
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                data-testid="payout-dashboard-start-date-input"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                data-testid="payout-dashboard-end-date-input"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Reason
              </label>
              <select
                value={filters.reason}
                onChange={(e) => setFilters({ ...filters, reason: e.target.value })}
                data-testid="payout-dashboard-reason-select"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All</option>
                <option value="BOOKING_CHARGE">Booking Charge</option>
                <option value="REFUND">Refund</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setFilters({
                tutorId: '',
                startDate: formatDate(getStartOfWeek(new Date()), 'yyyy-MM-dd'),
                endDate: formatDate(getEndOfWeek(new Date()), 'yyyy-MM-dd'),
                reason: '',
              })}
              data-testid="payout-dashboard-reset-button"
              className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Reset
            </button>
            <button
              onClick={applyFilters}
              data-testid="payout-dashboard-apply-button"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-4 text-slate-600">Loading payout data...</p>
        </div>
      )}

      {/* Grouped by Tutor */}
      {!loading && Object.keys(groupedByTutor).length === 0 && (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <Calendar className="mx-auto h-16 w-16 text-slate-400 mb-4" />
          <p className="text-slate-600">No payout data for this period</p>
        </div>
      )}

      {!loading && Object.keys(groupedByTutor).length > 0 && (
        <div className="space-y-6">
          {Object.entries(groupedByTutor).map(([tutorId, tutor]) => (
            <div key={tutorId} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              {/* Tutor Header */}
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">{tutor.tutorName}</h3>
                    <p className="text-sm text-slate-600">{tutor.tutorEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-600">Total Earnings</p>
                    <p className="text-2xl font-bold text-green-600">₹{tutor.total.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* Transaction Breakdown */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Session
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Calculation
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {tutor.entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-slate-400" />
                            {formatDate(new Date(entry.createdAt), 'MMM dd, yyyy')}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-800">
                          {entry.booking?.subject || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                              entry.booking?.isGroupSession
                                ? 'bg-green-100 text-green-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {entry.booking?.isGroupSession ? (
                              <>
                                <Users className="h-3 w-3" /> Group
                              </>
                            ) : (
                              <>
                                <Clock className="h-3 w-3" /> 1:1
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {entry.note ? (
                            <div className="flex items-center gap-2">
                              <code className="px-2 py-1 bg-slate-100 rounded text-xs font-mono">
                                {entry.note}
                              </code>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                          <span className="text-green-600 flex items-center justify-end gap-1">
                            <IndianRupee className="h-4 w-4" />
                            {Number(entry.delta).toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={4} className="px-6 py-3 text-right text-sm font-semibold text-slate-700">
                        Tutor Subtotal
                      </td>
                      <td className="px-6 py-3 text-right text-base font-bold text-green-600">
                        ₹{tutor.total.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grand Total */}
      {!loading && Object.keys(groupedByTutor).length > 0 && (
        <div className="mt-8 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Grand Total</p>
              <p className="text-xs opacity-75 mt-1">
                {formatDate(new Date(filters.startDate), 'MMM dd')} - {formatDate(new Date(filters.endDate), 'MMM dd, yyyy')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold">₹{totalPayout.toFixed(2)}</p>
              <p className="text-sm opacity-90 mt-1">
                {Object.keys(groupedByTutor).length} tutor{Object.keys(groupedByTutor).length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
