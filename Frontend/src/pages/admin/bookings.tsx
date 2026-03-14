// src/pages/admin/bookings.tsx
import { useEffect, useState } from 'react';
import { Search, Calendar, ChevronLeft, ChevronRight, Filter, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import api from '../../services/apiClient';

interface BookingItem {
  id: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  isDemo: boolean;
  tokensCharged: number | null;
  refundProcessed: boolean;
  createdAt: string;
  tutor: {
    id: string;
    user: { email: string; name?: string };
  };
  student: {
    id: string;
    user: { email: string; name?: string };
  };
  attendance?: {
    studentJoinedAt?: string;
    tutorJoinedAt?: string;
  };
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELED', label: 'Cancelled' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PENDING_SLOT', label: 'Pending Slot' },
  { value: 'WAITING_ROOM', label: 'Waiting Room' },
  { value: 'LIVE', label: 'Live' },
  { value: 'AUTO_CANCELLED_TUTOR_NO_SHOW', label: 'Tutor No-Show' },
  { value: 'AUTO_CANCELLED_STUDENT_NO_SHOW', label: 'Student No-Show' },
  { value: 'FAILED_TECHNICAL', label: 'Technical Failure' },
];

function getStatusStyle(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-green-100 text-green-800';
    case 'CONFIRMED':
      return 'bg-blue-100 text-blue-800';
    case 'CANCELED':
      return 'bg-slate-100 text-slate-700';
    case 'PENDING':
    case 'PENDING_SLOT':
      return 'bg-yellow-100 text-yellow-800';
    case 'WAITING_ROOM':
      return 'bg-indigo-100 text-indigo-700';
    case 'LIVE':
      return 'bg-purple-100 text-purple-800';
    case 'AUTO_CANCELLED_TUTOR_NO_SHOW':
      return 'bg-red-100 text-red-800';
    case 'AUTO_CANCELLED_STUDENT_NO_SHOW':
      return 'bg-orange-100 text-orange-800';
    case 'FAILED_TECHNICAL':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function getAttendanceLabel(booking: BookingItem) {
  const studentJoined = !!booking.attendance?.studentJoinedAt;
  const tutorJoined = !!booking.attendance?.tutorJoinedAt;

  if (studentJoined && tutorJoined) {
    return { label: 'Both Attended', style: 'text-green-700 bg-green-50' };
  }
  if (studentJoined && !tutorJoined) {
    return { label: 'Tutor Absent', style: 'text-red-700 bg-red-50' };
  }
  if (!studentJoined && tutorJoined) {
    return { label: 'Student Absent', style: 'text-orange-700 bg-orange-50' };
  }
  return { label: 'Neither Attended', style: 'text-slate-700 bg-slate-50' };
}

function getNoShowRefundNote(booking: BookingItem, isTutorNoShowStatus: boolean): { note: string; style: string } {
  if (booking.refundProcessed) {
    const note = isTutorNoShowStatus
      ? 'Token refunded to student (tutor no-show).'
      : 'Token refunded to student.';
    return { note, style: 'text-green-700' };
  }
  const note = isTutorNoShowStatus
    ? 'Pending refund — tutor no-show.'
    : 'Refund pending for student (tutor absent).';
  return { note, style: 'text-amber-700' };
}

function getRefundNote(booking: BookingItem) {
  const studentJoined = !!booking.attendance?.studentJoinedAt;
  const tutorJoined = !!booking.attendance?.tutorJoinedAt;
  const status = booking.status;

  if (status === 'COMPLETED' && studentJoined && tutorJoined) {
    return { note: 'Session completed successfully. Tutor earned their share.', style: 'text-green-700' };
  }

  if (status === 'AUTO_CANCELLED_TUTOR_NO_SHOW') {
    return getNoShowRefundNote(booking, true);
  }

  if (status === 'AUTO_CANCELLED_STUDENT_NO_SHOW') {
    return { note: 'Tutor gets paid. Student forfeits token (student no-show).', style: 'text-orange-700' };
  }

  const neitherStatuses = new Set(['CANCELED', 'AUTO_CANCELLED_TUTOR_NO_SHOW', 'AUTO_CANCELLED_STUDENT_NO_SHOW']);
  if (!studentJoined && !tutorJoined && neitherStatuses.has(status)) {
    return { note: 'Neither attended — company keeps tokens (company profit).', style: 'text-purple-700' };
  }

  if (studentJoined && !tutorJoined) {
    return getNoShowRefundNote(booking, false);
  }

  if (!studentJoined && tutorJoined) {
    return { note: 'Tutor gets paid. Student forfeits token.', style: 'text-orange-700' };
  }

  if (status === 'CANCELED') {
    const note = booking.refundProcessed ? 'Booking cancelled. Refund processed.' : 'Booking cancelled.';
    return { note, style: 'text-slate-600' };
  }

  return { note: '', style: '' };
}

function SortIcon({ field, sortBy, sortDir }: Readonly<{ field: string; sortBy: string; sortDir: 'asc' | 'desc' }>) {
  if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 ml-1 text-indigo-600" />
    : <ChevronDown className="w-3 h-3 ml-1 text-indigo-600" />;
}

export default function AdminBookings() {
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('startTime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadBookings();
  }, [page, statusFilter, typeFilter, sortBy, sortDir]);

  async function loadBookings() {
    try {
      setLoading(true);
      const params: any = { page, pageSize: 20, sortBy, sortDir };
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (search.trim()) params.q = search.trim();

      const { data } = await api.get('/admin/bookings', { params });
      setBookings(data.items || []);
      setMeta(data.meta || { page: 1, pageSize: 20, total: 0, totalPages: 0 });
    } catch (err) {
      console.error('Failed to load bookings:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    setPage(1);
    loadBookings();
  }

  function handleSort(field: string) {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(1);
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  function renderBookingsContent() {
    if (loading) {
      return <div className="text-center py-16 text-slate-500">Loading bookings...</div>;
    }
    if (bookings.length === 0) {
      return (
        <div className="text-center py-16 text-slate-500">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No bookings found</p>
        </div>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="bookings-table">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th
                className="px-4 py-3 text-left font-semibold text-slate-700 cursor-pointer select-none hover:text-indigo-600"
                onClick={() => handleSort('id')}
              >
                <span className="inline-flex items-center">Booking ID <SortIcon field="id" sortBy={sortBy} sortDir={sortDir} /></span>
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Student</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Tutor</th>
              <th
                className="px-4 py-3 text-left font-semibold text-slate-700 cursor-pointer select-none hover:text-indigo-600"
                onClick={() => handleSort('startTime')}
              >
                <span className="inline-flex items-center">Date & Time <SortIcon field="startTime" sortBy={sortBy} sortDir={sortDir} /></span>
              </th>
              <th
                className="px-4 py-3 text-left font-semibold text-slate-700 cursor-pointer select-none hover:text-indigo-600"
                onClick={() => handleSort('status')}
              >
                <span className="inline-flex items-center">Status <SortIcon field="status" sortBy={sortBy} sortDir={sortDir} /></span>
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Attendance</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Refund / Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bookings.map((booking) => {
              const attendance = getAttendanceLabel(booking);
              const refund = getRefundNote(booking);
              return (
                <tr key={booking.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3">
                    <span
                      className="font-mono text-xs text-indigo-700 bg-indigo-50 px-2 py-1 rounded cursor-default"
                      title={booking.id}
                    >
                      {booking.id.slice(-8).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{booking.student?.user?.name || 'Unknown'}</div>
                    <div className="text-xs text-slate-500">{booking.student?.user?.email || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{booking.tutor?.user?.name || 'Unknown'}</div>
                    <div className="text-xs text-slate-500">{booking.tutor?.user?.email || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-900">{formatDate(booking.startTime)}</div>
                    <div className="text-xs text-slate-500">to {formatDate(booking.endTime)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusStyle(booking.status)}`}>
                      {booking.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${booking.isDemo ? 'text-emerald-600' : 'text-slate-700'}`}>
                      {booking.isDemo ? 'Demo' : 'Paid'}
                    </span>
                    {!booking.isDemo && booking.tokensCharged && (
                      <div className="text-xs text-slate-400">{Number(booking.tokensCharged)} token(s)</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-lg text-xs font-medium ${attendance.style}`}>
                      {attendance.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {refund.note && <span className={`text-xs ${refund.style}`}>{refund.note}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="bookings-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Calendar className="w-8 h-8 text-purple-600" />
          All Bookings
        </h1>
        <p className="text-slate-600 mt-1">
          View all bookings — which student booked which tutor, attendance status, and refund details
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              data-testid="bookings-search-input"
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
              placeholder="Search by student or tutor email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              data-testid="bookings-status-select"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              data-testid="bookings-type-select"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Types</option>
              <option value="demo">Demo</option>
              <option value="paid">Paid</option>
            </select>
            <button
              onClick={handleSearch}
              data-testid="bookings-search-button"
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition"
            >
              Search
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-slate-500">Date Range:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            data-testid="bookings-date-from-input"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-sm text-slate-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            data-testid="bookings-date-to-input"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); loadBookings(); }}
            data-testid="bookings-clear-dates-button"
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Clear dates
          </button>
          <button
            onClick={handleSearch}
            data-testid="bookings-apply-button"
            className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="text-sm text-slate-500">
        Showing {bookings.length} of {meta.total} bookings
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {renderBookingsContent()}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              data-testid="bookings-prev-page-button"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {page} of {meta.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages}
              data-testid="bookings-next-page-button"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
