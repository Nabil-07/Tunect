import { useEffect, useState } from "react";
import { Clock, Calendar, Bell, User } from "lucide-react";
import {
  getTutorWaitlist,
  notifyWaitlistStudent,
  type WaitlistEntryDto,
} from "../../services/bookingsService";
import { useToast } from "../../contexts/ToastContext";

export default function TutorWaitlist() {
  const { showSuccess, showError } = useToast();
  const [entries, setEntries] = useState<WaitlistEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState<string | null>(null);

  useEffect(() => {
    loadWaitlist();
  }, []);

  async function loadWaitlist() {
    try {
      setLoading(true);
      const data = await getTutorWaitlist();
      setEntries(data);
    } catch (err: any) {
      showError(err?.response?.data?.message || "Failed to load waitlist");
    } finally {
      setLoading(false);
    }
  }

  async function handleNotifyStudent(waitlistId: string) {
    try {
      setNotifying(waitlistId);
      await notifyWaitlistStudent(waitlistId);
      showSuccess("Student notified successfully! They have 24 hours to book.");
      loadWaitlist();
    } catch (err: any) {
      showError(err?.response?.data?.message || "Failed to notify student");
    } finally {
      setNotifying(null);
    }
  }

  const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 3) return "text-red-600";
    if (priority === 2) return "text-amber-600";
    return "text-blue-600";
  };

  return (
    <div className="max-w-4xl mx-auto p-6" data-testid="tutor-waitlist-page">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Student Waitlist</h1>
        <p className="text-slate-600">
          Manage students waiting for available slots
        </p>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4" data-testid="tutor-waitlist-total-waiting-card">
          <div className="text-sm text-slate-600 mb-1">Total Waiting</div>
          <div className="text-2xl font-bold text-slate-800">{entries.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4" data-testid="tutor-waitlist-high-priority-card">
          <div className="text-sm text-slate-600 mb-1">High Priority</div>
          <div className="text-2xl font-bold text-red-600">
            {entries.filter((e) => e.priority >= 3).length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4" data-testid="tutor-waitlist-this-week-card">
          <div className="text-sm text-slate-600 mb-1">This Week</div>
          <div className="text-2xl font-bold text-blue-600">
            {
              entries.filter(
                (e) =>
                  new Date(e.createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
              ).length
            }
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-4 text-slate-600">Loading waitlist...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && entries.length === 0 && (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <User className="mx-auto h-16 w-16 text-slate-400 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-2">No students waiting</h3>
          <p className="text-slate-600">
            Students will appear here when they join your waitlist
          </p>
        </div>
      )}

      {/* Waitlist Entries */}
      {!loading && entries.length > 0 && (
        <div className="space-y-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`bg-white border rounded-lg p-6 ${
                entry.priority >= 3
                  ? "border-red-300 shadow-md"
                  : entry.priority === 2
                  ? "border-amber-300"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-slate-800">
                      {entry.student?.name || "Student"}
                    </h3>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${getPriorityColor(
                        entry.priority
                      )} bg-opacity-10`}
                    >
                      Priority {entry.priority}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 truncate">{entry.student?.email}</p>
                </div>
              </div>

              {/* Subject */}
              {entry.subject && (
                <div className="mb-4">
                  <span className="inline-block px-3 py-1 bg-slate-100 text-slate-700 text-sm font-medium rounded-full">
                    {entry.subject}
                  </span>
                </div>
              )}

              {/* Details */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm text-slate-600">
                  <Calendar className="h-4 w-4 mr-2" />
                  Requested slot: {formatDateTime(entry.requestedStartTime)}
                  {entry.requestedEndTime &&
                    ` - ${new Date(entry.requestedEndTime).toLocaleTimeString("en-IN", {
                      timeStyle: "short",
                    })}`}
                </div>
                <div className="flex items-center text-sm text-slate-600">
                  <Clock className="h-4 w-4 mr-2" />
                  Added {formatDateTime(entry.createdAt)}
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => handleNotifyStudent(entry.id)}
                disabled={notifying === entry.id}
                className={`w-full py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                  notifying === entry.id
                    ? "bg-blue-400 text-white cursor-wait"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
                data-testid="tutor-waitlist-notify-button"
              >
                <Bell className="h-4 w-4" />
                {notifying === entry.id ? "Notifying..." : "Notify Student - Slot Available"}
              </button>

              <p className="mt-2 text-xs text-slate-500 text-center">
                Student will have 24 hours to book after notification
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
