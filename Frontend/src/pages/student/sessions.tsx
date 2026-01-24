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
  hasAttended?: boolean; // Flag indicating if student joined/attended the session
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
      
      // Prefer backend categorization, but also include 'all' as fallback
      // Backend returns: { unscheduled, upcoming, completed, all }
      const backendUpcoming = toArray(result?.upcoming);
      const backendCompleted = toArray(result?.completed);
      const backendAll = toArray(result?.all);
      
      // Combine all bookings, prioritizing backend categorization
      // Use 'all' array if backend categorization arrays are empty but 'all' exists
      const allBookings: Booking[] = backendAll.length > 0 && 
        backendUpcoming.length === 0 && 
        backendCompleted.length === 0
        ? backendAll
        : [
            ...toArray(result?.unscheduled),
            ...backendUpcoming,
            ...backendCompleted,
            ...backendAll,
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
        
        // Active sessions first (currently happening)
        const aActive = a.status === 'CONFIRMED' && aTime <= now.getTime() && aEnd >= now.getTime();
        const bActive = b.status === 'CONFIRMED' && bTime <= now.getTime() && bEnd >= now.getTime();
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        
        // Upcoming sessions next (by start time ascending)
        if (aTime > now.getTime() && bTime > now.getTime()) {
          return aTime - bTime;
        }
        // Completed sessions last (by end time descending)
        if (aEnd < now.getTime() && bEnd < now.getTime()) {
          return bEnd - aEnd;
        }
        // Mixed: active > upcoming > completed
        if (aActive) return -1;
        if (bActive) return 1;
        if (aTime > now.getTime()) return -1;
        if (bTime > now.getTime()) return 1;
        return bEnd - aEnd;
      });
      
      console.log('[Sessions] Parsed sessions:', sorted.length, 'items');
      console.log('[Sessions] Upcoming from backend:', backendUpcoming.length);
      console.log('[Sessions] Completed from backend:', backendCompleted.length);
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

  const getStatusLabel = (session: Booking) => {
    const now = new Date();
    const status = session.status;
    
    // COMPLETED status always shows as "Completed"
    if (status === 'COMPLETED') {
      return { label: 'Completed', color: 'bg-green-100 text-green-700' };
    }
    
    // Special handling for CONFIRMED sessions - check if time has passed and attendance
    if (status === 'CONFIRMED') {
      if (session.endTime && new Date(session.endTime) < now) {
        // Session time has passed - check if student attended
        if (session.hasAttended === true) {
          // Student attended the class (joined LiveKit room) - show as Completed
          return { label: 'Completed', color: 'bg-green-100 text-green-700' };
        } else {
          // Session time passed but student didn't attend - show as Expired
          return { label: 'Expired', color: 'bg-orange-100 text-orange-700' };
        }
      }
      if (session.startTime && session.endTime) {
        const start = new Date(session.startTime);
        const end = new Date(session.endTime);
        if (now >= start && now <= end) {
          return { label: 'Active', color: 'bg-green-100 text-green-700' };
        }
        if (new Date(session.startTime) > now) {
          return { label: 'Upcoming', color: 'bg-blue-100 text-blue-700' };
        }
      }
      return { label: 'Upcoming', color: 'bg-blue-100 text-blue-700' };
    }
    
    const statusMap: Record<string, { label: string; color: string }> = {
      PENDING: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
      PENDING_SLOT: { label: 'Pending Slot', color: 'bg-amber-100 text-amber-700' },
      CANCELED: { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
    };
    return statusMap[status] || { label: status, color: 'bg-slate-100 text-slate-700' };
  };

  // Filter sessions based on backend logic and current time
  const now = new Date();
  
  // Upcoming: CONFIRMED status with startTime in the future
  const isUpcoming = (session: Booking) => {
    return (
      session.status === 'CONFIRMED' &&
      session.startTime &&
      new Date(session.startTime) > now
    );
  };

  // Active: CONFIRMED status with current time between startTime and endTime
  const isActive = (session: Booking) => {
    if (session.status !== 'CONFIRMED' || !session.startTime || !session.endTime) {
      return false;
    }
    const start = new Date(session.startTime);
    const end = new Date(session.endTime);
    return now >= start && now <= end;
  };

  // Completed: COMPLETED status OR endTime in the past (includes both attended and expired)
  // We'll use getStatusLabel to distinguish between "Completed" (attended) and "Expired" (not attended)
  const isCompleted = (session: Booking) => {
    return (
      session.status === 'COMPLETED' ||
      (session.endTime && new Date(session.endTime) < now)
    );
  };

  // Filter sessions - prioritize backend categorization if available
  const upcomingSessions = sessions.filter(isUpcoming);
  const activeSessions = sessions.filter(isActive);
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
          {/* Show message if no upcoming or active sessions */}
          {upcomingSessions.length === 0 && activeSessions.length === 0 && completedSessions.length > 0 && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800 text-sm">
                No upcoming or active sessions. Check your completed sessions below.
              </p>
            </div>
          )}

          {/* Active Sessions */}
          {activeSessions.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-slate-800 mb-4">Active Sessions</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeSessions.map((session) => {
                  const meetingUrl = meetingLinks.get(session.id);
                  const joinUrl = meetingUrl?.startsWith('livekit:') || meetingUrl?.startsWith('webrtc:')
                    ? `/class/${session.id}`
                    : meetingUrl;
                  const statusMeta = { label: 'Active', color: 'bg-green-100 text-green-700' };
                  const isGroup = session.isGroupSession;

                  return (
                    <div
                      key={session.id}
                      className={`p-6 border rounded-lg shadow-sm bg-white hover:shadow-lg transition-all duration-200 border-green-300 ${
                        isGroup ? 'bg-green-50' : 'bg-white'
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

                      {joinUrl && (
                        <a
                          href={joinUrl}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                        >
                          <Video className="h-4 w-4" />
                          Join Class Now
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                  const statusMeta = getStatusLabel(session);
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

                      {joinUrl && (isUpcoming(session) || isActive(session)) && (
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
                  const statusMeta = getStatusLabel(session);
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
