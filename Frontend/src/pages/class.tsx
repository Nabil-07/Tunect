import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Calendar, Clock, Copy, ExternalLink, RefreshCcw, Video, PencilRuler } from "lucide-react";
import { getBookingDetails, type BookingDetailsDto } from "../services/bookingsService";
import { useToast } from "../contexts/ToastContext";

export default function ClassPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const [data, setData] = useState<BookingDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingId) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  async function refresh() {
    if (!bookingId) return;
    try {
      setLoading(true);
      const res = await getBookingDetails(bookingId);
      setData(res);
    } catch (err: any) {
      console.error("Failed to load booking details", err);
      showError(err?.response?.data?.message || "Failed to load class details");
    } finally {
      setLoading(false);
    }
  }

  const meetingUrl = data?.meetingUrl;
  const isLivekit = !!meetingUrl && (meetingUrl.startsWith("livekit:") || meetingUrl.startsWith("webrtc:"));

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-slate-500">Booking</p>
          <h1 className="text-2xl font-bold text-slate-800">Class Details</h1>
          {bookingId && <p className="text-sm text-slate-500">ID: {bookingId}</p>}
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-600">Loading class…</div>
      ) : !data ? (
        <div className="text-center text-red-600">Unable to load class details.</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">Tutor</p>
              <p className="text-lg font-semibold text-slate-800">{data.tutor?.name || "Tutor"}</p>
              {data.isGroupSession ? (
                <p className="text-sm text-slate-600">
                  Students: {data.currentEnrollment}/{data.maxStudents}
                </p>
              ) : (
                <p className="text-sm text-slate-600">Student ID: {data.studentId}</p>
              )}
            </div>
            <div className="text-sm text-slate-600">
              {data.startTime && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {new Date(data.startTime).toLocaleString()}
                </div>
              )}
              {data.endTime && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Ends {new Date(data.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => {
                if (!meetingUrl) return;
                if (isLivekit) {
                  navigate(`/call/${bookingId}`);
                  return;
                }
                window.open(meetingUrl, "_blank");
              }}
              disabled={!meetingUrl}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-600"
            >
              <Video className="h-5 w-5" />
              {meetingUrl ? (isLivekit ? "Open Classroom" : "Join Class") : "No meeting link"}
              <ExternalLink className="h-4 w-4" />
            </button>

            <button
              onClick={() => bookingId && navigate(`/whiteboard/${bookingId}`)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 font-medium text-slate-800 hover:bg-slate-50"
            >
              <PencilRuler className="h-5 w-5" />
              Open Whiteboard
            </button>
          </div>

          {meetingUrl && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-sm">
              <div className="truncate">
                <p className="text-slate-500">Meeting URL</p>
                <p className="font-mono text-slate-700 truncate">{meetingUrl}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(meetingUrl);
                  showSuccess("Copied meeting link");
                }}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                <Copy className="h-4 w-4" /> Copy
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}