import { useEffect, useState } from "react";
import { Clock, Calendar, AlertCircle, CheckCircle, XCircle, Hourglass } from "lucide-react";
import {
  getMyWaitlist,
  bookFromWaitlist,
  removeFromWaitlist,
  type WaitlistEntryDto,
} from "../../services/bookingsService";
import { useToast } from "../../contexts/ToastContext";
import { useNavigate } from "react-router-dom";

export default function MyWaitlist() {
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<WaitlistEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    loadWaitlist();
  }, []);

  async function loadWaitlist() {
    try {
      setLoading(true);
      const data = await getMyWaitlist();
      setEntries(data);
    } catch (err: any) {
      showError(err?.response?.data?.message || "Failed to load waitlist");
    } finally {
      setLoading(false);
    }
  }

  async function handleBookFromWaitlist(waitlistId: string) {
    try {
      setBooking(waitlistId);
      await bookFromWaitlist(waitlistId);
      showSuccess("Booking confirmed! Redirecting to your bookings...");
      setTimeout(() => navigate("/student/bookings"), 1500);
    } catch (err: any) {
      showError(err?.response?.data?.message || "Failed to book session");
      setBooking(null);
    }
  }

  async function handleRemove(waitlistId: string) {
    if (!confirm("Are you sure you want to remove this waitlist entry?")) return;
    
    try {
      setRemoving(waitlistId);
      await removeFromWaitlist(waitlistId);
      showSuccess("Removed from waitlist");
      loadWaitlist();
    } catch (err: any) {
      showError(err?.response?.data?.message || "Failed to remove from waitlist");
    } finally {
      setRemoving(null);
    }
  }

  const getStatusBadge = (status: WaitlistEntryDto["status"]) => {
    switch (status) {
      case "WAITING":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
            <Hourglass className="h-3 w-3" />
            Waiting
          </span>
        );
      case "NOTIFIED":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">
            <CheckCircle className="h-3 w-3" />
            Slot Available
          </span>
        );
      case "EXPIRED":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">
            <XCircle className="h-3 w-3" />
            Expired
          </span>
        );
      case "BOOKED":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-700 text-sm font-medium rounded-full">
            <CheckCircle className="h-3 w-3" />
            Booked
          </span>
        );
    }
  };

  const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const isExpiringSoon = (entry: WaitlistEntryDto) => {
    if (entry.status !== "NOTIFIED" || !entry.expiresAt) return false;
    const hoursLeft = (new Date(entry.expiresAt).getTime() - Date.now()) / 3600000;
    return hoursLeft > 0 && hoursLeft < 6;
  };

  const isExpired = (entry: WaitlistEntryDto) => {
    if (entry.status !== "NOTIFIED" || !entry.expiresAt) return false;
    return new Date(entry.expiresAt).getTime() < Date.now();
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">My Waitlist</h1>
        <p className="text-slate-600">
          Track your waitlist requests and book when slots become available
        </p>
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
          <Hourglass className="mx-auto h-16 w-16 text-slate-400 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-2">No waitlist entries</h3>
          <p className="text-slate-600">
            When a tutor you want is fully booked, you can join their waitlist
          </p>
        </div>
      )}

      {/* Waitlist Entries */}
      {!loading && entries.length > 0 && (
        <div className="space-y-4">
          {entries.map((entry) => {
            const expiringSoon = isExpiringSoon(entry);
            const expired = isExpired(entry);
            const canBook = entry.status === "NOTIFIED" && !expired;

            return (
              <div
                key={entry.id}
                className={`bg-white border rounded-lg p-6 ${
                  expiringSoon ? "border-amber-300 shadow-lg" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-800 mb-1">
                      {entry.tutor?.name || "Tutor"}
                    </h3>
                    <p className="text-sm text-slate-600">{entry.tutor?.email}</p>
                  </div>
                  {getStatusBadge(entry.status)}
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
                    Requested: {formatDateTime(entry.requestedStartTime)}
                  </div>
                  <div className="flex items-center text-sm text-slate-600">
                    <Clock className="h-4 w-4 mr-2" />
                    Added on {formatDateTime(entry.createdAt)}
                  </div>
                  {entry.notifiedAt && (
                    <div className="flex items-center text-sm text-green-600">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Notified on {formatDateTime(entry.notifiedAt)}
                    </div>
                  )}
                  {entry.expiresAt && (
                    <div className={`flex items-center text-sm ${
                      expired ? "text-red-600" : expiringSoon ? "text-amber-600" : "text-slate-600"
                    }`}>
                      <AlertCircle className="h-4 w-4 mr-2" />
                      {expired
                        ? "Booking window expired"
                        : `Book by ${formatDateTime(entry.expiresAt)}`}
                    </div>
                  )}
                </div>

                {/* Expiring Soon Warning */}
                {expiringSoon && (
                  <div className="flex items-center gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded">
                    <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                    <span className="text-sm text-amber-700 font-medium">
                      Hurry! Your booking window expires soon
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  {canBook && (
                    <button
                      onClick={() => handleBookFromWaitlist(entry.id)}
                      disabled={booking === entry.id}
                      className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                        booking === entry.id
                          ? "bg-green-400 text-white cursor-wait"
                          : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                    >
                      {booking === entry.id ? "Booking..." : "Book Now"}
                    </button>
                  )}
                  {(entry.status === "WAITING" || entry.status === "NOTIFIED") && (
                    <button
                      onClick={() => handleRemove(entry.id)}
                      disabled={removing === entry.id}
                      className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                    >
                      {removing === entry.id ? "Removing..." : "Remove"}
                    </button>
                  )}
                </div>

                {/* Priority Badge */}
                {entry.priority > 1 && (
                  <div className="mt-3 text-xs text-blue-600">
                    Priority: {entry.priority}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
