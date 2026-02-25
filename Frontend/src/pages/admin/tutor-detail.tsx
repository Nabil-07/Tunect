import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, DollarSign, BookOpen, Award, MessageSquare, Clock, AlertTriangle, Trash2, Loader2, ChevronRight, ChevronDown as ChevronDownIcon } from 'lucide-react';
import { fetchTutorDetail } from '../../services/adminService';
import { http } from '../../api/http';

/** Resolve a document URL: if it's already absolute, return as-is; otherwise prefix the API base. */
const resolveDocUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
};

interface TutorDetail {
  id: string;
  bio: string | null;
  hourlyRate: number | null;
  status: string;
  subjects: string[];
  createdAt: string;
  lastActiveDate: string | null;
  demeritPoints?: number;
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    updatedAt: string;
    isBanned: boolean;
    bannedScope: string | null;
    bannedAt: string | null;
  };
  bookings: Array<{
    id: string;
    startTime: string | null;
    endTime: string | null;
    status: string;
    isDemo: boolean;
    createdAt: string;
    attendance?: {
      tutorWaitingRoomAttended: boolean;
      studentWaitingRoomAttended: boolean;
    } | null;
    student: {
      id: string;
      user: {
        name: string | null;
        email: string;
      };
    };
    review: {
      rating: number;
      comment: string | null;
      createdAt: string;
    } | null;
  }>;
  wallet: {
    balance: number;
    updatedAt: string;
  } | null;
  walletLedger: Array<{
    id: string;
    delta: number;
    reason: string;
    createdAt: string;
    bookingId: string | null;
  }>;
  payouts: Array<{
    id: string;
    amount: number;
    status: string;
    reference: string | null;
    createdAt: string;
  }>;
  reviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    booking: {
      student: {
        user: {
          email: string;
          name: string | null;
        };
      };
    };
  }>;
  assignments: Array<{
    id: string;
    title: string;
    status: string;
    createdAt: string;
    student: {
      user: {
        email: string;
        name: string | null;
      };
    };
  }>;
  kycDocs: Array<{
    id: string;
    docType: string;
    url: string;
    status: string;
    notes: string | null;
    createdAt: string;
  }>;
  kycApplications: Array<{
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  conversations?: Array<{
    id: string;
    createdAt: string;
    student: {
      id: string;
      user: {
        id: string;
        email: string;
        name: string | null;
      };
    };
    messages: Array<{
      id: string;
      text: string;
      createdAt: string;
      user: {
        id: string;
        email: string;
        name: string | null;
      };
    }>;
  }>;
}

export default function TutorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tutor, setTutor] = useState<TutorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [expandedBookingStudents, setExpandedBookingStudents] = useState<Set<string>>(new Set());
  const [deletingUser, setDeletingUser] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ ok: boolean; message: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadTutor = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchTutorDetail(id!);
        setTutor(data);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load tutor details');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadTutor();
    }
  }, [id]);

  const conversationGroups = useMemo(() => {
    if (!tutor?.conversations?.length) return [];

    const groups = new Map<
      string,
      {
        student: {
          id: string;
          user: {
            id: string;
            email: string;
            name: string | null;
          };
        };
        startedAt: string;
        conversationCount: number;
        messages: Array<{
          id: string;
          text: string;
          createdAt: string;
          user: {
            id: string;
            email: string;
            name: string | null;
          };
        }>;
      }
    >();

    for (const conversation of tutor.conversations) {
      const studentId = conversation.student.id;
      const existing = groups.get(studentId);

      if (!existing) {
        groups.set(studentId, {
          student: conversation.student,
          startedAt: conversation.createdAt,
          conversationCount: 1,
          messages: [...conversation.messages],
        });
      } else {
        existing.conversationCount += 1;
        if (new Date(conversation.createdAt).getTime() < new Date(existing.startedAt).getTime()) {
          existing.startedAt = conversation.createdAt;
        }
        existing.messages.push(...conversation.messages);
      }
    }

    const grouped = Array.from(groups.values()).map((group) => {
      const uniqueMessages = Array.from(new Map(group.messages.map((message) => [message.id, message])).values());
      uniqueMessages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return {
        ...group,
        messages: uniqueMessages,
      };
    });

    grouped.sort((a, b) => {
      const aLatest = a.messages[0]?.createdAt ?? a.startedAt;
      const bLatest = b.messages[0]?.createdAt ?? b.startedAt;
      return new Date(bLatest).getTime() - new Date(aLatest).getTime();
    });

    return grouped;
  }, [tutor?.conversations]);

  useEffect(() => {
    if (!conversationGroups.length) {
      setSelectedStudentId(null);
      return;
    }

    const selectedExists = conversationGroups.some((group) => group.student.id === selectedStudentId);
    if (!selectedStudentId || !selectedExists) {
      setSelectedStudentId(conversationGroups[0].student.id);
    }
  }, [conversationGroups, selectedStudentId]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !tutor) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error || 'Tutor not found'}</p>
          <Link to="/admin/tutors" className="text-blue-600 hover:underline mt-2 inline-block">
            ← Back to Tutors
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        to="/admin/tutors"
        className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Tutors
      </Link>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {tutor.user.name || tutor.user.email}
        </h1>
        <p className="text-slate-600 mb-4">{tutor.user.email}</p>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <DollarSign className="w-5 h-5 text-blue-600 mr-2" />
              <span className="text-sm font-medium text-slate-700">Wallet Balance</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">
              ₹{tutor.wallet ? Number(tutor.wallet.balance).toFixed(2) : '0.00'}
            </p>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <BookOpen className="w-5 h-5 text-green-600 mr-2" />
              <span className="text-sm font-medium text-slate-700">Total Bookings</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{tutor.bookings.length}</p>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <Award className="w-5 h-5 text-purple-600 mr-2" />
              <span className="text-sm font-medium text-slate-700">Reviews</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">{tutor.reviews.length}</p>
          </div>

          <div className={`rounded-lg p-4 ${(tutor.demeritPoints ?? 0) > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
            <div className="flex items-center mb-2">
              <AlertTriangle className={`w-5 h-5 mr-2 ${(tutor.demeritPoints ?? 0) > 0 ? 'text-red-600' : 'text-slate-500'}`} />
              <span className="text-sm font-medium text-slate-700">Demerit Points</span>
            </div>
            <p className={`text-2xl font-bold ${(tutor.demeritPoints ?? 0) > 0 ? 'text-red-600' : 'text-slate-600'}`}>
              {tutor.demeritPoints ?? 0}
            </p>
            <p className="text-xs text-slate-500 mt-1">Threshold: 3</p>
          </div>

          <div className="bg-orange-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <Calendar className="w-5 h-5 text-orange-600 mr-2" />
              <span className="text-sm font-medium text-slate-700">Member Since</span>
            </div>
            <p className="text-sm font-bold text-orange-600">
              {new Date(tutor.user.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center mb-1">
              <Clock className="w-4 h-4 text-slate-600 mr-2" />
              <span className="text-xs font-medium text-slate-700">Last Active</span>
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {tutor.lastActiveDate ? new Date(tutor.lastActiveDate).toLocaleString() : 
               tutor.user.updatedAt ? new Date(tutor.user.updatedAt).toLocaleString() : 'Never'}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center mb-1">
              <DollarSign className="w-4 h-4 text-slate-600 mr-2" />
              <span className="text-xs font-medium text-slate-700">Hourly Rate</span>
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {tutor.hourlyRate ? `₹${tutor.hourlyRate}` : 'Not set'}
            </p>
          </div>
          {tutor.conversations && (
            <div
              className="bg-slate-50 rounded-lg p-3 cursor-pointer hover:bg-blue-50 transition-colors"
              onClick={() => document.getElementById('conversations-section')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <div className="flex items-center mb-1">
                <MessageSquare className="w-4 h-4 text-slate-600 mr-2" />
                <span className="text-xs font-medium text-slate-700">Conversations</span>
              </div>
              <p className="text-sm font-semibold text-blue-600 underline">{tutor.conversations.length}</p>
            </div>
          )}
        </div>

        {tutor.user.isBanned && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-red-800 font-medium">🚫 Account Blocked</p>
            <p className="text-sm text-red-600">
              Scope: {tutor.user.bannedScope || 'ALL'} | Banned: {tutor.user.bannedAt ? new Date(tutor.user.bannedAt).toLocaleDateString() : 'Unknown'}
            </p>
          </div>
        )}

        {/* Admin: Delete User Account */}
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-red-800 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Delete User Account
              </p>
              <p className="text-xs text-red-600 mt-1">
                Permanently deactivate this tutor account. PII will be scrambled but transactional records are preserved.
              </p>
            </div>
            <button
              onClick={() => { setShowDeleteModal(true); setDeleteResult(null); }}
              disabled={deletingUser}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete Account
            </button>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
              {deleteResult ? (
                <>
                  <div className={`text-center mb-4 ${deleteResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                    <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3 ${deleteResult.ok ? 'bg-emerald-100' : 'bg-red-100'}">
                      {deleteResult.ok ? '✓' : '✕'}
                    </div>
                    <h3 className="text-lg font-semibold">{deleteResult.ok ? 'Account Deleted' : 'Delete Failed'}</h3>
                    <p className="text-sm mt-2 text-slate-600">{deleteResult.message}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowDeleteModal(false);
                      if (deleteResult.ok) navigate('/admin/tutors');
                    }}
                    className="w-full py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
                  >
                    {deleteResult.ok ? 'Go to Tutors' : 'Close'}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                      <Trash2 className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Delete User Account</h3>
                      <p className="text-sm text-slate-500">This action cannot be undone</p>
                    </div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-red-800">
                      You are about to permanently deactivate <strong>{tutor.user.name || tutor.user.email}</strong>'s account.
                      Their personal data will be scrambled, but booking and payment records will be preserved for compliance.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDeleteModal(false)}
                      disabled={deletingUser}
                      className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        setDeletingUser(true);
                        try {
                          await http.delete(`/users/${tutor.user.id}`);
                          setDeleteResult({ ok: true, message: 'Account has been permanently deactivated. All transactional records have been preserved.' });
                        } catch (err: any) {
                          setDeleteResult({ ok: false, message: err.response?.data?.message || 'Failed to delete user account' });
                        } finally {
                          setDeletingUser(false);
                        }
                      }}
                      disabled={deletingUser}
                      className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {deletingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {deletingUser ? 'Deleting…' : 'Yes, Delete Account'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tutor.bio && (
          <div className="mt-4 bg-slate-50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-900 mb-2">Bio</h3>
            <p className="text-slate-700">{tutor.bio}</p>
          </div>
        )}

        {tutor.subjects && tutor.subjects.length > 0 && (
          <div className="mt-4 bg-slate-50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-900 mb-2">Subjects</h3>
            <div className="flex flex-wrap gap-2">
              {tutor.subjects.map((subject, idx) => (
                <span key={idx} className="px-3 py-1 bg-white rounded-full text-sm text-slate-700 border border-slate-200">
                  {subject}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Booking History */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Booking History</h2>
        {tutor.bookings.length === 0 ? (
          <p className="text-slate-500">No bookings</p>
        ) : (
          <div className="space-y-3">
            {(() => {
              const groups = new Map<string, { student: typeof tutor.bookings[0]['student']; bookings: typeof tutor.bookings }>(); 
              for (const b of tutor.bookings) {
                const sid = b.student.id;
                const existing = groups.get(sid);
                if (existing) {
                  existing.bookings.push(b);
                } else {
                  groups.set(sid, { student: b.student, bookings: [b] });
                }
              }
              return Array.from(groups.values()).map(({ student, bookings }) => {
                const isExpanded = expandedBookingStudents.has(student.id);
                const toggleExpand = () => {
                  setExpandedBookingStudents(prev => {
                    const next = new Set(prev);
                    if (next.has(student.id)) next.delete(student.id);
                    else next.add(student.id);
                    return next;
                  });
                };
                const statusBadge = (status: string) => {
                  if (status === 'COMPLETED') return 'bg-green-100 text-green-800';
                  if (status === 'CONFIRMED') return 'bg-blue-100 text-blue-800';
                  if (status === 'AUTO_CANCELLED_TUTOR_NO_SHOW') return 'bg-red-100 text-red-700';
                  if (status === 'AUTO_CANCELLED_STUDENT_NO_SHOW') return 'bg-orange-100 text-orange-700';
                  if (status === 'PENDING_SLOT') return 'bg-purple-100 text-purple-700';
                  if (status === 'CANCELED') return 'bg-slate-100 text-slate-700';
                  return 'bg-slate-100 text-slate-800';
                };

                return (
                  <div key={student.id} className="border rounded-lg overflow-hidden">
                    <button
                      onClick={toggleExpand}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded
                          ? <ChevronDownIcon className="w-4 h-4 text-slate-500 shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}
                        <div>
                          <p className="font-semibold text-sm text-slate-900">
                            {student.user.name || student.user.email}
                          </p>
                          <p className="text-xs text-slate-500">
                            {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {Object.entries(
                          bookings.reduce<Record<string, number>>((acc, b) => {
                            const label = b.status.replace(/AUTO_CANCELLED_/g, '').replace(/_/g, ' ');
                            acc[label] = (acc[label] || 0) + 1;
                            return acc;
                          }, {})
                        ).map(([label, count]) => (
                          <span key={label} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-600">
                            {count} {label}
                          </span>
                        ))}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="divide-y divide-slate-100">
                        {bookings.map((booking) => {
                          const neitherJoined =
                            !(booking.attendance?.tutorWaitingRoomAttended ?? false) &&
                            !(booking.attendance?.studentWaitingRoomAttended ?? false);
                          const tutorJoinedOnly =
                            (booking.attendance?.tutorWaitingRoomAttended ?? false) &&
                            !(booking.attendance?.studentWaitingRoomAttended ?? false);
                          const studentJoinedOnly =
                            !(booking.attendance?.tutorWaitingRoomAttended ?? false) &&
                            (booking.attendance?.studentWaitingRoomAttended ?? false);

                          return (
                            <div key={booking.id} className="px-4 py-3 pl-11">
                              <div className="flex justify-between items-start">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-slate-600">
                                    {booking.startTime && booking.endTime
                                      ? `${new Date(booking.startTime).toLocaleString()} - ${new Date(booking.endTime).toLocaleString()}`
                                      : 'Time TBD'}
                                  </p>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    {booking.isDemo && <span className="text-indigo-600 font-medium">Demo · </span>}
                                    ID: {booking.id.slice(0, 8)}…
                                  </p>

                                  {/* Contextual attendance messages */}
                                  {booking.status === 'CANCELED' && neitherJoined && (
                                    <p className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                                      Neither the tutor nor the student joined. No payout.
                                    </p>
                                  )}
                                  {booking.status === 'AUTO_CANCELLED_TUTOR_NO_SHOW' && (
                                    <p className="mt-1.5 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                                      ⚠️ Tutor didn't join.{studentJoinedOnly ? ' Student showed up.' : ''} Demerit point applied.
                                    </p>
                                  )}
                                  {booking.status === 'AUTO_CANCELLED_STUDENT_NO_SHOW' && (
                                    <p className="mt-1.5 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700">
                                      Student didn't join.{tutorJoinedOnly ? ' Tutor showed up.' : ''} Tutor still gets paid.
                                    </p>
                                  )}

                                  {booking.review && (
                                    <p className="text-sm text-yellow-600 mt-1.5">
                                      ⭐ {booking.review.rating}/5 — {booking.review.comment}
                                    </p>
                                  )}
                                </div>
                                <span className={`ml-3 shrink-0 px-2 py-0.5 rounded text-[11px] font-medium ${statusBadge(booking.status)}`}>
                                  {booking.status.replace(/AUTO_CANCELLED_/g, '').replace(/_/g, ' ')}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* Wallet Ledger */}
      {tutor.walletLedger.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Earnings History</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Date</th>
                  <th className="text-left py-2 px-4">Reason</th>
                  <th className="text-right py-2 px-4">Amount</th>
                </tr>
              </thead>
              <tbody>
                {tutor.walletLedger.map((entry) => (
                  <tr key={entry.id} className="border-b">
                    <td className="py-2 px-4 text-sm">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 px-4 text-sm">{entry.reason}</td>
                    <td className={`text-right py-2 px-4 font-semibold ${
                      Number(entry.delta) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {Number(entry.delta) >= 0 ? '+' : ''}₹{Number(entry.delta).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payouts */}
      {tutor.payouts.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Payouts</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Date</th>
                  <th className="text-right py-2 px-4">Amount</th>
                  <th className="text-left py-2 px-4">Status</th>
                  <th className="text-left py-2 px-4">Reference</th>
                </tr>
              </thead>
              <tbody>
                {tutor.payouts.map((payout) => (
                  <tr key={payout.id} className="border-b">
                    <td className="py-2 px-4 text-sm">
                      {new Date(payout.createdAt).toLocaleString()}
                    </td>
                    <td className="text-right py-2 px-4 font-semibold">
                      ₹{Number(payout.amount).toFixed(2)}
                    </td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        payout.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                        payout.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {payout.status}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-sm text-slate-500">
                      {payout.reference || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reviews */}
      {tutor.reviews.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Reviews</h2>
          <div className="space-y-3">
            {tutor.reviews.map((review) => (
              <div key={review.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">
                      {review.booking.student.user.name || review.booking.student.user.email}
                    </p>
                    <p className="text-sm text-yellow-600 mt-1">
                      ⭐ {review.rating}/5
                    </p>
                    {review.comment && (
                      <p className="text-sm text-slate-700 mt-2">{review.comment}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      {new Date(review.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assignments */}
      {tutor.assignments.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Assignments</h2>
          <div className="space-y-2">
            {tutor.assignments.map((assignment) => (
              <div key={assignment.id} className="border rounded-lg p-3">
                <p className="font-semibold">{assignment.title}</p>
                <p className="text-sm text-slate-600">
                  Student: {assignment.student.user.name || assignment.student.user.email} | Status: {assignment.status}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(assignment.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KYC Documents */}
      {tutor.kycDocs.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-bold text-slate-900">KYC Documents</h2>
            <Link
              to={`/admin/kyc-verification?tutorId=${encodeURIComponent(tutor.id)}`}
              className="text-sm text-blue-600 hover:underline"
            >
              Open full KYC review
            </Link>
          </div>
          <div className="space-y-2">
            {tutor.kycDocs.map((doc) => (
              <div key={doc.id} className="border rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <Link
                      to={`/admin/kyc-verification?tutorId=${encodeURIComponent(tutor.id)}&docId=${encodeURIComponent(doc.id)}`}
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      {doc.docType}
                    </Link>
                    <p className="text-sm text-slate-600">
                      Status: {doc.status}
                    </p>
                    {doc.notes && (
                      <p className="text-sm text-slate-500 mt-1">Notes: {doc.notes}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-sm">
                    <Link
                      to={`/admin/kyc-verification?tutorId=${encodeURIComponent(tutor.id)}&docId=${encodeURIComponent(doc.id)}`}
                      className="text-blue-700 hover:underline"
                    >
                      Review in KYC panel
                    </Link>
                    <a
                      href={resolveDocUrl(doc.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      View Document
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages/Conversations */}
      {tutor.conversations && tutor.conversations.length > 0 && (
        <div id="conversations-section" className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Messages & Conversations</h2>
          <div className="flex gap-4" style={{ minHeight: 400 }}>
            {/* Conversation list (left panel) */}
            <div className="w-1/3 border-r border-slate-200 pr-4 overflow-y-auto" style={{ maxHeight: 500 }}>
              {conversationGroups.map((group) => {
                const lastMsg = group.messages[0];
                const isSelected = selectedStudentId === group.student.id;
                return (
                  <button
                    key={group.student.id}
                    onClick={() => setSelectedStudentId(group.student.id)}
                    className={`w-full text-left p-3 rounded-lg mb-2 transition-colors ${
                      isSelected ? 'bg-blue-50 border border-blue-300' : 'bg-slate-50 hover:bg-slate-100 border border-transparent'
                    }`}
                  >
                    <p className="font-semibold text-sm text-slate-900 truncate">
                      {group.student.user.name || group.student.user.email}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {group.messages.length} messages
                      {group.conversationCount > 1 ? ` • ${group.conversationCount} conversations` : ''}
                    </p>
                    {lastMsg && (
                      <p className="text-xs text-slate-400 mt-1 truncate">
                        {lastMsg.text.slice(0, 60)}{lastMsg.text.length > 60 ? '…' : ''}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Chat view (right panel) */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {(() => {
                const selectedGroup = conversationGroups.find((group) => group.student.id === selectedStudentId);
                if (!selectedGroup) {
                  return (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                      <div className="text-center">
                        <MessageSquare className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        <p>Select a student to view messages</p>
                      </div>
                    </div>
                  );
                }
                return (
                  <>
                    <div className="border-b border-slate-200 pb-3 mb-3">
                      <p className="font-semibold text-slate-900">
                        {selectedGroup.student.user.name || selectedGroup.student.user.email}
                      </p>
                      <p className="text-xs text-slate-500">
                        Started: {new Date(selectedGroup.startedAt).toLocaleString()} · {selectedGroup.messages.length} messages
                        {selectedGroup.conversationCount > 1 ? ` · ${selectedGroup.conversationCount} conversations` : ''}
                      </p>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-2" style={{ maxHeight: 400 }}>
                      {selectedGroup.messages.slice().reverse().map((msg) => {
                        const isTutor = msg.user.id === tutor.user.id;
                        return (
                          <div key={msg.id} className={`flex ${isTutor ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] rounded-xl px-3 py-2 ${
                              isTutor ? 'bg-blue-100 text-blue-900' : 'bg-slate-100 text-slate-800'
                            }`}>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-semibold">
                                  {isTutor ? '🎓 ' : '📚 '}{msg.user.name || msg.user.email}
                                </span>
                              </div>
                              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                              <p className="text-[10px] text-slate-400 mt-1 text-right">
                                {new Date(msg.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
