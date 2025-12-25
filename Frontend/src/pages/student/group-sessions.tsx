import { useEffect, useState } from "react";
import { Users, Clock, IndianRupee, Calendar, Video, AlertCircle } from "lucide-react";
import {
  getAvailableGroupSessions,
  joinGroupSession,
  type GroupBookingDto,
} from "../../services/bookingsService";
import { useToast } from "../../contexts/ToastContext";
import { useNavigate } from "react-router-dom";

export default function GroupSessions() {
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<GroupBookingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, [subjectFilter]);

  async function loadSessions() {
    try {
      setLoading(true);
      const data = await getAvailableGroupSessions(
        subjectFilter ? { subject: subjectFilter } : undefined
      );
      setSessions(data);
    } catch (err: any) {
      showError(err?.response?.data?.message || "Failed to load group sessions");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinSession(bookingId: string) {
    try {
      setJoining(bookingId);
      await joinGroupSession(bookingId);
      showSuccess("Successfully joined group session!");
      loadSessions(); // Refresh to update enrollment
      // Optionally navigate to bookings page
      setTimeout(() => navigate("/student/bookings"), 1500);
    } catch (err: any) {
      showError(err?.response?.data?.message || "Failed to join session");
    } finally {
      setJoining(null);
    }
  }

  const availableSpots = (session: GroupBookingDto) =>
    session.maxStudents - session.currentEnrollment;

  const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Group Sessions</h1>
        <p className="text-slate-600">
          Join group learning sessions with other students at reduced rates
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex items-center gap-4">
        <input
          type="text"
          placeholder="Filter by subject (e.g., Math, Physics)..."
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={() => setSubjectFilter("")}
          className="px-4 py-2 text-slate-600 hover:text-slate-800"
        >
          Clear
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-4 text-slate-600">Loading sessions...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && sessions.length === 0 && (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <Users className="mx-auto h-16 w-16 text-slate-400 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-2">No group sessions available</h3>
          <p className="text-slate-600">
            {subjectFilter
              ? "Try a different subject or clear the filter"
              : "Check back later for new group sessions"}
          </p>
        </div>
      )}

      {/* Sessions Grid */}
      {!loading && sessions.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map((session) => {
            const spots = availableSpots(session);
            const almostFull = spots <= 2;

            return (
              <div
                key={session.id}
                className="bg-white border border-slate-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-800 mb-1">
                      {session.tutor.name || "Tutor"}
                    </h3>
                  </div>
                  {session.meetingUrl && (
                    <Video className="h-5 w-5 text-blue-500" title="Google Meet" />
                  )}
                </div>

                {/* Subject */}
                <div className="mb-4">
                  <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                    {session.notes || "General Session"}
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-slate-600">
                    <Calendar className="h-4 w-4 mr-2" />
                    {session.startTime ? formatDateTime(session.startTime) : "TBD"}
                  </div>
                  <div className="flex items-center text-sm text-slate-600">
                    <Clock className="h-4 w-4 mr-2" />
                    {session.startTime && session.endTime
                      ? `${Math.round(
                          (new Date(session.endTime).getTime() -
                            new Date(session.startTime).getTime()) /
                            60000
                        )} minutes`
                      : "TBD"}
                  </div>
                  <div className="flex items-center text-sm text-slate-600">
                    <Users className="h-4 w-4 mr-2" />
                    {session.currentEnrollment}/{session.maxStudents} students
                  </div>
                  <div className="flex items-center text-lg font-semibold text-blue-600">
                    <IndianRupee className="h-5 w-5 mr-1" />
                    {session.pricePerStudent} tokens per student
                  </div>
                </div>

                {/* Availability Warning */}
                {almostFull && (
                  <div className="flex items-center gap-2 mb-4 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    Only {spots} spot{spots === 1 ? "" : "s"} left!
                  </div>
                )}

                {/* Action Button */}
                <button
                  onClick={() => handleJoinSession(session.id)}
                  disabled={joining === session.id || spots === 0}
                  className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                    spots === 0
                      ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                      : joining === session.id
                      ? "bg-blue-400 text-white cursor-wait"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {joining === session.id
                    ? "Joining..."
                    : spots === 0
                    ? "Session Full"
                    : "Join Session"}
                </button>

                {/* Notes */}
                {session.notes && (
                  <p className="mt-3 text-xs text-slate-500 line-clamp-2">{session.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
