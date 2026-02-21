// src/pages/admin/bookings.tsx
import { useEffect, useState } from 'react';
import { Search, Calendar, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
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

function getRefundNote(booking: BookingItem) {
  const studentJoined = !!booking.attendance?.studentJoinedAt;
  const tutorJoined = !!booking.attendance?.tutorJoinedAt;
  const status = booking.status;

  if (status === 'COMPLETED' && studentJoined && tutorJoined) {
    return { note: 'Session completed successfully. Tutor earned their share.', style: 'text-green-700' };
  }

  if (status === 'AUTO_CANCELLED_TUTOR_NO_SHOW') {
    if (booking.refundProcessed) {
      return { note: 'Token refunded to student (tutor no-show).', style: 'text-green-700' };
    }
    return { note: 'Pending refund — tutor no-show.', style: 'text-amber-700' };
  }

  if (status === 'AUTO_CANCELLED_STUDENT_NO_SHOW') {
    return { note: 'Tutor gets paid. Student forfeits token (student no-show).', style: 'text-orange-700' };
  }

  if (!studentJoined && !tutorJoined && ['CANCELED', 'AUTO_CANCELLED_TUTOR_NO_SHOW', 'AUTO_CANCELLED_STUDENT_NO_SHOW'].includes(status)) {
    return { note: 'Neither attended — company keeps tokens (company profit).', style: 'text-purple-700' };
  }

  if (studentJoined && !tutorJoined) {
    if (booking.refundProcessed) {
      return { note: 'Token refunded to student.', style: 'text-green-700' };
    }
    return { note: 'Refund pending for student (tutor absent).', style: 'text-amber-700' };
  }

  if (!studentJoined && tutorJoined) {
    return { note: 'Tutor gets paid. Student forfeits token.', style: 'text-orange-700' };
  }

  if (status === 'CANCELED') {
    if (booking.refundProcessed) {
      return { note: 'Booking cancelled. Refund processed.', style: 'text-slate-600' };
    }
    return { note: 'Booking cancelled.', style: 'text-slate-600' };
  }

  return { note: '', style: '' };
}

export default function AdminBookings() {
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadBookings();
  }, [page, statusFilter]);

  async function loadBookings() {
    try {
      setLoading(true);
      const params: any = { page, pageSize: 20 };
      if (statusFilter) params.status = statusFilter;
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

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
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
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
            placeholder="Search by student or tutor email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={handleSearch}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition"
          >
            Search
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="text-sm text-slate-500">
        Showing {bookings.length} of {meta.total} bookings
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-slate-500">Loading bookings...</div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No bookings found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Student</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Tutor</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Date & Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
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
                        <div className="font-medium text-slate-900">
                          {booking.student?.user?.name || 'Unknown'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {booking.student?.user?.email || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {booking.tutor?.user?.name || 'Unknown'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {booking.tutor?.user?.email || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-900">{formatDate(booking.startTime)}</div>
                        <div className="text-xs text-slate-500">
                          to {formatDate(booking.endTime)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusStyle(booking.status)}`}>
                          {booking.status.replace(/_/g, ' ')}
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
                        {refund.note && (
                          <span className={`text-xs ${refund.style}`}>{refund.note}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
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
