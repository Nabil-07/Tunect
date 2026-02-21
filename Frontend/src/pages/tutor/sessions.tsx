// src/pages/tutor/sessions.tsx
import { useEffect, useState } from 'react';
import { getMySessions } from '../../services/sessionService';
import { convertToGroupSession, getBookingDetails, cancelBooking } from '../../services/bookingsService';
import { Users, Clock, Calendar, UserPlus, X, IndianRupee, XCircle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { differenceInHours } from 'date-fns';
import Loader from '../../components/common/Loader';
import ConfirmDialog from '../../components/ConfirmDialog';

type Session = {
  id: string;
  studentName?: string;
  studentGrade?: string | null;
  subject?: string;
  startTime: string;
  endTime: string;
  status?: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'PENDING_SLOT' | 'CONFIRMED' | 'EXPIRED' | 'NO_SHOW' | 'CANCELED';
  isGroupSession?: boolean;
  isDemo?: boolean;
  maxStudents?: number;
  currentEnrollment?: number;
  pricePerStudent?: number;
};

function toArray(maybe: any): Session[] {
  if (Array.isArray(maybe)) return maybe as Session[];
  if (maybe && Array.isArray(maybe.items)) return maybe.items as Session[];
  return [];
}

export default function MySessions() {
  const { showSuccess, showError } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [maxStudents, setMaxStudents] = useState(5);
  const [pricePerStudent, setPricePerStudent] = useState(0.5);
  const [converting, setConverting] = useState(false);
  const [meetingLinks, setMeetingLinks] = useState<Map<string, string>>(new Map());
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedCancelSession, setSelectedCancelSession] = useState<Session | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Ticker: re-render every 60s so sessions move Upcoming → Active when class starts
  const [_tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    const withLinks = sessions.filter((s) => s.status && s.status !== 'PENDING_SLOT');
    if (withLinks.length === 0) {
      setMeetingLinks(new Map());
      return;
    }

    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        withLinks.map(async (s) => {
          try {
            const detail = await getBookingDetails(s.id);
            return [s.id, detail?.meetingUrl as string | undefined] as const;
          } catch (err) {
            console.error('[Sessions] Failed to load booking details', s.id, err);
            return [s.id, undefined] as const;
          }
        })
      );

      if (!cancelled) {
        const next = new Map<string, string>();
        entries.forEach(([id, url]) => {
          if (url) next.set(id, url);
        });
        setMeetingLinks(next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessions]);

  async function loadSessions() {
    try {
      setLoading(true);
      console.log('[Sessions] Fetching sessions...');
      const result = await getMySessions();
      console.log('[Sessions] API response:', result);
      const sessionsArray = toArray(result);
      console.log('[Sessions] Parsed sessions:', sessionsArray.length, 'items');
      setSessions(sessionsArray);
    } catch (err) {
      console.error('[Sessions] Failed to load sessions', err);
      showError('Failed to load sessions');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  function canConvertToGroup(session: Session): boolean {
    // Can only convert if:
    // 1. Not already a group session
    // 2. Status is PENDING_SLOT (unbooked)
    // 3. More than 24 hours before the session
    if (session.isGroupSession) return false;
    if (session.status !== 'PENDING_SLOT') return false;
    if (!session.startTime) return false;
    
    const hoursUntilSession = differenceInHours(new Date(session.startTime), new Date());
    return hoursUntilSession > 24;
  }

  function openConvertModal(session: Session) {
    setSelectedSession(session);
    setMaxStudents(5);
    setPricePerStudent(0.5);
    setConvertModalOpen(true);
  }

  async function handleConvertToGroup() {
    if (!selectedSession) return;

    try {
      setConverting(true);
      await convertToGroupSession(selectedSession.id, {
        maxStudents,
        pricePerStudent,
      });
      showSuccess('Successfully converted to group session!');
      setConvertModalOpen(false);
      setSelectedSession(null);
      loadSessions(); // Refresh the list
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to convert to group session');
    } finally {
      setConverting(false);
    }
  }

  const formatDateTime = (iso: string) => {
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800 mb-2">📅 My Teaching Sessions</h2>
        <p className="text-slate-600">
          Manage your 1:1 and group sessions. Convert unbooked slots to group sessions.
        </p>
      </div>

      {loading ? (
        <Loader message="Loading sessions..." />
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <Calendar className="mx-auto h-16 w-16 text-slate-400 mb-4" />
          <p className="text-slate-600">No sessions found.</p>
        </div>
      ) : (() => {
        const now = new Date();
        // Split sessions into sections
        const activeSessions = sessions.filter((s) => s.status === 'ACTIVE');
        const upcomingSessions = sessions.filter((s) =>
          s.status === 'UPCOMING' || s.status === 'CONFIRMED' ||
          (s.status === 'PENDING_SLOT' && s.startTime && new Date(s.startTime) > now)
        );
        const pastSessions = sessions.filter((s) =>
          s.status === 'COMPLETED' || s.status === 'EXPIRED' ||
          s.status === 'NO_SHOW' || s.status === 'CANCELED' ||
          s.status === 'PENDING_SLOT'
        ).filter((s) => !upcomingSessions.includes(s) && !activeSessions.includes(s));

        const statusBadge = (s: Session) => {
          const map: Record<string, string> = {
            ACTIVE:       'bg-green-100 text-green-600',
            UPCOMING:     'bg-blue-100 text-blue-600',
            CONFIRMED:    'bg-blue-100 text-blue-600',
            PENDING_SLOT: 'bg-amber-100 text-amber-600',
            EXPIRED:      'bg-orange-100 text-orange-600',
            NO_SHOW:      'bg-red-100 text-red-600',
            COMPLETED:    'bg-green-100 text-green-600',
            CANCELED:     'bg-red-100 text-red-600',
          };
          const labelMap: Record<string, string> = {
            PENDING_SLOT: 'UNBOOKED',
            NO_SHOW:      'NO SHOW',
            ACTIVE:       'ACTIVE',
          };
          const st = s.status ?? '';
          return (
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${map[st] ?? 'bg-slate-100 text-slate-600'}`}>
              {labelMap[st] ?? st}
            </span>
          );
        };

        const sessionCard = (session: Session) => {
          const isGroup = session.isGroupSession;
          const canConvert = canConvertToGroup(session);
          const meetingUrl = meetingLinks.get(session.id);
          const joinUrl = meetingUrl?.startsWith('livekit:') || meetingUrl?.startsWith('webrtc:')
            ? `/class/${session.id}`
            : (meetingUrl || `/class/${session.id}`);
          const isActive = session.status === 'ACTIVE';
          const canJoin = session.status === 'UPCOMING' || session.status === 'ACTIVE' || session.status === 'CONFIRMED';
          const canCancel = (session.status === 'UPCOMING' || session.status === 'CONFIRMED') &&
            session.startTime && new Date(session.startTime) > now;

          return (
            <div
              key={session.id}
              className={`p-6 border rounded-lg shadow-sm bg-white hover:shadow-lg transition-all duration-200 ${
                isActive ? 'border-green-400' : isGroup ? 'border-green-200 bg-green-50' : 'border-slate-200'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {isGroup ? (
                      <Users className="h-5 w-5 text-green-600" />
                    ) : (
                      <Clock className={`h-5 w-5 ${isActive ? 'text-green-600' : 'text-blue-600'}`} />
                    )}
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      isGroup ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {isGroup ? 'Group Session' : '1:1 Session'}
                    </span>
                    {session.isDemo && (
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                        Demo
                      </span>
                    )}
                  </div>
                  <p className="text-lg font-semibold text-slate-800">
                    {session.subject ?? 'Session'}
                  </p>
                </div>
                {session.status && statusBadge(session)}
              </div>

              {/* Details */}
              <div className="space-y-2 mb-4">
                {!isGroup && session.studentName && (
                  <p className="text-sm text-slate-700 flex items-center gap-2">
                    <Users className="h-4 w-4" /> Student: {session.studentName}
                  </p>
                )}
                {!isGroup && session.studentGrade && (
                  <p className="text-sm text-slate-700 flex items-center gap-2">
                    <Users className="h-4 w-4" /> Class: {session.studentGrade}
                  </p>
                )}
                {isGroup && (
                  <p className="text-sm text-slate-700 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {session.currentEnrollment ?? 0}/{session.maxStudents ?? 0} students
                  </p>
                )}
                <p className="text-sm text-slate-600 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {formatDateTime(session.startTime)}
                </p>
                <p className="text-sm text-slate-600 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {new Date(session.endTime).toLocaleTimeString('en-IN', { timeStyle: 'short' })}
                </p>
                {isGroup && session.pricePerStudent !== undefined && (
                  <p className="text-sm font-semibold text-green-600 flex items-center gap-2">
                    <IndianRupee className="h-4 w-4" />
                    {session.pricePerStudent} tokens/student
                  </p>
                )}
              </div>

              {/* Cancelled notice */}
              {session.status === 'CANCELED' && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-3">
                  <p className="text-xs font-semibold text-red-700">Session was cancelled.</p>
                </div>
              )}

              {/* No-show demerit message */}
              {session.status === 'NO_SHOW' && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-3">
                  <p className="text-xs font-semibold text-red-700">
                    ⚠ You didn&apos;t join. You received 1 demerit point.
                  </p>
                  <p className="text-[10px] text-red-600 mt-0.5">
                    3 demerit points will result in an hourly rate deduction from your payout.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {canJoin && (
                  <a
                    href={joinUrl}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg hover:opacity-90 transition-colors font-medium ${
                      isActive ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
                    }`}
                  >
                    {isActive ? 'Join Class Now' : 'Join Class'}
                  </a>
                )}
                {canConvert && (
                  <button
                    onClick={() => openConvertModal(session)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    <UserPlus className="h-4 w-4" />
                    Convert to Group
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={() => {
                      setSelectedCancelSession(session);
                      setCancelModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-300 bg-white text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel Session
                  </button>
                )}
              </div>
            </div>
          );
        };

        return (
          <div className="space-y-10">
            {/* Active Sessions */}
            {activeSessions.length > 0 && (
              <div>
                <h3 className="text-xl font-semibold text-slate-800 mb-4">Active Sessions</h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeSessions.map(sessionCard)}
                </div>
              </div>
            )}

            {/* Upcoming Sessions */}
            {upcomingSessions.length > 0 && (
              <div>
                <h3 className="text-xl font-semibold text-slate-800 mb-4">Upcoming Sessions</h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {upcomingSessions.map(sessionCard)}
                </div>
              </div>
            )}

            {/* Past Sessions (Completed / Expired / No-Show / Cancelled) */}
            {pastSessions.length > 0 && (
              <div>
                <h3 className="text-xl font-semibold text-slate-800 mb-4">Past Sessions</h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pastSessions.map(sessionCard)}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Convert Modal */}
      {convertModalOpen && selectedSession && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold text-lg">Convert to Group Session</h3>
              <button
                className="p-1 rounded hover:bg-slate-100"
                onClick={() => setConvertModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <p className="text-sm text-slate-600 mb-2">
                  Session: <span className="font-semibold">{selectedSession.subject}</span>
                </p>
                <p className="text-sm text-slate-600">
                  Time: <span className="font-semibold">{formatDateTime(selectedSession.startTime)}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Maximum Students (2-10)
                </label>
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={maxStudents}
                  onChange={(e) => setMaxStudents(parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Price per Student (in tokens)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={pricePerStudent}
                  onChange={(e) => setPricePerStudent(parseFloat(e.target.value))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Recommended: 0.5 tokens for group sessions
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Once converted, students can join this session at the specified token rate. The slot will be open for enrollment.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t flex items-center justify-end gap-3">
              <button
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                onClick={() => setConvertModalOpen(false)}
                disabled={converting}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed"
                onClick={handleConvertToGroup}
                disabled={converting}
              >
                {converting ? 'Converting...' : 'Convert to Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        isOpen={cancelModalOpen}
        onClose={() => {
          setCancelModalOpen(false);
          setSelectedCancelSession(null);
        }}
        onConfirm={async () => {
          if (!selectedCancelSession) return;
          try {
            setCancelling(true);
            await cancelBooking(selectedCancelSession.id);
            showSuccess('Session cancelled successfully. 1 token has been refunded to the student.');
            setCancelModalOpen(false);
            setSelectedCancelSession(null);
            loadSessions();
          } catch (err: any) {
            showError(err?.response?.data?.message || 'Failed to cancel session');
          } finally {
            setCancelling(false);
          }
        }}
        title="Cancel Session"
        message="Are you sure you want to cancel this session? The student will receive 1 token refund, and you will receive 1 demerit point. If you reach 3 demerit points, your hourly rate will be deducted from your payout."
        confirmText="Yes, Cancel"
        cancelText="No, Keep It"
        variant="warning"
        isLoading={cancelling}
      />
    </div>
  );
}
