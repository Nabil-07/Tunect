// src/pages/student/sessions.tsx
import { useEffect, useState } from 'react';
import { getMyBookings } from '../../services/bookingsService';
import { getBookingDetails } from '../../services/bookingsService';
import { Clock, Calendar, Video, ExternalLink, IndianRupee, Users } from 'lucide-react';
import Loader from '../../components/common/Loader';
import { useToast } from '../../contexts/ToastContext';

type Booking = {
  id: string;
  tutor?: { id: string; name?: string; email?: string; hourlyRate?: number };
  startTime?: string | null;
  endTime?: string | null;
  status: string;
  isDemo?: boolean;
  tokensCharged: number | string;
  isGroupSession?: boolean;
  currentEnrollment?: number;
  maxStudents?: number;
};

function toArray(maybe: any): Booking[] {
  if (Array.isArray(maybe)) return maybe as Booking[];
  if (maybe && Array.isArray(maybe.items)) return maybe.items as Booking[];
  if (maybe && Array.isArray(maybe.all)) return maybe.all as Booking[];
  return [];
}

export default function MySessions() {
  const { showError } = useToast();
  const [sessions, setSessions] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [meetingLinks, setMeetingLinks] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    const withLinks = sessions.filter((s) => s.status === 'CONFIRMED' || s.status === 'COMPLETED');
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
      const result = await getMyBookings();
      console.log('[Sessions] API response:', result);
      
      // Combine all bookings from different categories
      const allBookings: Booking[] = [
        ...toArray(result?.unscheduled),
        ...toArray(result?.upcoming),
        ...toArray(result?.completed),
        ...toArray(result?.all),
      ];
      
      // Remove duplicates by ID
      const uniqueBookings = Array.from(
        new Map(allBookings.map((b) => [b.id, b])).values()
      );
      
      // Sort by startTime (most recent first, or upcoming first)
      const now = new Date();
      const sorted = uniqueBookings.sort((a, b) => {
        const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
        const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
        const aEnd = a.endTime ? new Date(a.endTime).getTime() : 0;
        const bEnd = b.endTime ? new Date(b.endTime).getTime() : 0;
        
        // Upcoming sessions first (by start time ascending)
        if (aTime > now.getTime() && bTime > now.getTime()) {
          return aTime - bTime;
        }
        // Completed sessions last (by end time descending)
        if (aEnd < now.getTime() && bEnd < now.getTime()) {
          return bEnd - aEnd;
        }
        // Mixed: upcoming before completed
        if (aTime > now.getTime()) return -1;
        if (bTime > now.getTime()) return 1;
        return bEnd - aEnd;
      });
      
      console.log('[Sessions] Parsed sessions:', sorted.length, 'items');
      setSessions(sorted);
    } catch (err) {
      console.error('[Sessions] Failed to load sessions', err);
      showError('Failed to load sessions');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  const formatDateTime = (iso: string | null | undefined) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      CONFIRMED: { label: 'Upcoming', color: 'bg-blue-100 text-blue-700' },
      COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-700' },
      PENDING: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
      PENDING_SLOT: { label: 'Pending Slot', color: 'bg-amber-100 text-amber-700' },
      CANCELED: { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
    };
    return statusMap[status] || { label: status, color: 'bg-slate-100 text-slate-700' };
  };

  const isUpcoming = (session: Booking) => {
    if (!session.startTime) return false;
    return new Date(session.startTime) > new Date();
  };

  const isCompleted = (session: Booking) => {
    if (!session.endTime) return false;
    return new Date(session.endTime) < new Date();
  };

  const upcomingSessions = sessions.filter(isUpcoming);
  const completedSessions = sessions.filter(isCompleted);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800 mb-2">📚 My Learning Sessions</h2>
        <p className="text-slate-600">
          View all your upcoming and completed sessions with tutors.
        </p>
      </div>

      {loading ? (
        <Loader message="Loading sessions..." />
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <Calendar className="mx-auto h-16 w-16 text-slate-400 mb-4" />
          <p className="text-slate-600">No sessions found.</p>
        </div>
      ) : (
        <>
          {/* Upcoming Sessions */}
          {upcomingSessions.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-slate-800 mb-4">Upcoming Sessions</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {upcomingSessions.map((session) => {
                  const meetingUrl = meetingLinks.get(session.id);
                  const joinUrl = meetingUrl?.startsWith('livekit:') || meetingUrl?.startsWith('webrtc:')
                    ? `/class/${session.id}`
                    : meetingUrl;
                  const statusMeta = getStatusLabel(session.status);
                  const isGroup = session.isGroupSession;

                  return (
                    <div
                      key={session.id}
                      className={`p-6 border rounded-lg shadow-sm bg-white hover:shadow-lg transition-all duration-200 ${
                        isGroup ? 'border-green-200 bg-green-50' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {isGroup ? (
                              <Users className="h-5 w-5 text-green-600" />
                            ) : (
                              <Clock className="h-5 w-5 text-blue-600" />
                            )}
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                              isGroup
                                ? 'bg-green-100 text-green-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {isGroup ? 'Group Session' : '1:1 Session'}
                            </span>
                          </div>
                          <p className="text-lg font-semibold text-slate-800">
                            {session.tutor?.name || 'Tutor'}
                          </p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusMeta.color}`}>
                          {statusMeta.label}
                        </span>
                      </div>

                      <div className="space-y-2 mb-4">
                        {isGroup && (
                          <p className="text-sm text-slate-700 flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            {session.currentEnrollment ?? 0}/{session.maxStudents ?? 0} students
                          </p>
                        )}
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {formatDateTime(session.startTime || null)}
                        </p>
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {session.endTime
                            ? new Date(session.endTime).toLocaleTimeString('en-IN', {
                                timeStyle: 'short',
                              })
                            : '—'}
                        </p>
                        {!session.isDemo && (
                          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <IndianRupee className="h-4 w-4" />
                            {Math.round((session.tutor?.hourlyRate || 0) * Number(session.tokensCharged || 1))}
                          </p>
                        )}
                      </div>

                      {joinUrl && session.status === 'CONFIRMED' && (
                        <a
                          href={joinUrl}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                          <Video className="h-4 w-4" />
                          Join Class
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Sessions */}
          {completedSessions.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold text-slate-800 mb-4">Completed Sessions</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {completedSessions.map((session) => {
                  const meetingUrl = meetingLinks.get(session.id);
                  const statusMeta = getStatusLabel(session.status);
                  const isGroup = session.isGroupSession;

                  return (
                    <div
                      key={session.id}
                      className={`p-6 border rounded-lg shadow-sm bg-white hover:shadow-lg transition-all duration-200 ${
                        isGroup ? 'border-green-200 bg-green-50' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {isGroup ? (
                              <Users className="h-5 w-5 text-green-600" />
                            ) : (
                              <Clock className="h-5 w-5 text-green-600" />
                            )}
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                              isGroup
                                ? 'bg-green-100 text-green-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {isGroup ? 'Group Session' : '1:1 Session'}
                            </span>
                          </div>
                          <p className="text-lg font-semibold text-slate-800">
                            {session.tutor?.name || 'Tutor'}
                          </p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusMeta.color}`}>
                          {statusMeta.label}
                        </span>
                      </div>

                      <div className="space-y-2 mb-4">
                        {isGroup && (
                          <p className="text-sm text-slate-700 flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            {session.currentEnrollment ?? 0}/{session.maxStudents ?? 0} students
                          </p>
                        )}
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {formatDateTime(session.startTime || null)}
                        </p>
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {session.endTime
                            ? new Date(session.endTime).toLocaleTimeString('en-IN', {
                                timeStyle: 'short',
                              })
                            : '—'}
                        </p>
                        {!session.isDemo && (
                          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <IndianRupee className="h-4 w-4" />
                            {Math.round((session.tutor?.hourlyRate || 0) * Number(session.tokensCharged || 1))}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
