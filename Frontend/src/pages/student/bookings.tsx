import { useEffect, useState } from "react";
import {
  FileDown,
  Calendar,
  Clock,
  IndianRupee,
  AlertCircle,
  CalendarPlus2,
  XCircle,
  Video,
  Users,
  ExternalLink,
  Coins,
  Star,
  BookOpen,
  CheckCircle,
} from "lucide-react";
import {
  getMyBookings,
  type BookingDto,
  cancelBooking,
  getBookingDetails,
} from "../../services/bookingsService";
import { downloadReceipt } from "../../services/paymentsService";
import SlotPicker from "../../components/SlotPicker";
import { useSearchParams } from "react-router-dom";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../contexts/ToastContext";
import api from "../../lib/apiClient";
import { createReview, getMyReviews } from "../../services/reviewService";

type Booking = BookingDto;

export default function MyBookings() {
  const [params, setParams] = useSearchParams();
  const { showSuccess, showError } = useToast();

  const [unscheduled, setUnscheduled] = useState<Booking[]>([]);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [completed, setCompleted] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [tokenBalances, setTokenBalances] = useState<Map<string, number>>(new Map());
  const [meetingLinks, setMeetingLinks] = useState<Map<string, string>>(new Map());

  const [reviewMap, setReviewMap] = useState<Map<string, number>>(new Map());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // slot picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerBooking, setPickerBooking] = useState<Booking | null>(null);

  // confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBooking, setConfirmBooking] = useState<Booking | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [cancelling, setCancelling] = useState(false);

  function openPickerFor(b: Booking) {
    setPickerBooking(b);
    setPickerOpen(true);
  }

  function closePicker() {
    setPickerOpen(false);
    setPickerBooking(null);
  }

  async function handleCancel(booking: Booking) {
    const refundInfo = calculateRefundInfo(booking);
    setConfirmBooking(booking);
    setConfirmMessage(refundInfo.message || 'Are you sure you want to cancel this booking?');
    setConfirmOpen(true);
  }

  async function confirmCancel() {
    if (!confirmBooking) return;

    setCancelling(true);
    try {
      await cancelBooking(confirmBooking.id);
      
      // Refresh bookings, token balances, and demo statuses
      await Promise.all([
        refresh(),
        // Refresh token balances
        api.get('/students/me/token-balances').then(res => {
          const balances = Array.isArray(res.data) ? res.data : [];
          const balanceMap = new Map<string, number>();
          balances.forEach((b: any) => {
            if (b.tutorId) {
              balanceMap.set(b.tutorId, Number(b.balance || 0));
            }
          });
          setTokenBalances(balanceMap);
        }).catch(() => {}), // Ignore errors
      ]);
      
      showSuccess('Booking cancelled successfully');
      setConfirmOpen(false);
      
      // Trigger demo status refresh if this was a demo booking
      if (confirmBooking.isDemo) {
        // Dispatch event to refresh demo statuses in other components
        window.dispatchEvent(new CustomEvent('demo-status-changed', { 
          detail: { tutorId: confirmBooking.tutorId } 
        }));
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to cancel booking');
    } finally {
      setCancelling(false);
    }
  }

  function calculateRefundInfo(booking: Booking) {
    if (booking.isDemo) {
      return { percent: 0, message: 'This is a free demo session. No refund applies.' };
    }

    // Check if it's a group session
    const isGroupSession = (booking as any).isGroupSession || false;
    if (isGroupSession) {
      return { percent: 0, message: 'Group sessions are non-refundable.' };
    }

    // PENDING or PENDING_SLOT (no time selected yet) = full refund
    if (!booking.startTime) {
      return { percent: 100, message: 'Full refund - no slot was scheduled yet.' };
    }

    const now = new Date();
    const start = new Date(booking.startTime);
    const hoursUntil = (start.getTime() - now.getTime()) / (1000 * 60 * 60);

    // ✅ NEW POLICY: 48hrs+ = 100%, 24-48hrs = 50%, <24hrs = 0%
    if (hoursUntil < 0) {
      return { percent: 0, message: 'Cannot cancel - session has already started or passed.' };
    } else if (hoursUntil >= 48) {
      return { 
        percent: 100, 
        message: '100% refund - Cancelled 48+ hours before the session.' 
      };
    } else if (hoursUntil >= 24) {
      return { 
        percent: 50, 
        message: '50% refund - Cancelled 24-48 hours before the session.' 
      };
    } else {
      return { 
        percent: 0, 
        message: 'No refund - Must cancel at least 24 hours before the session.' 
      };
    }
  }

  async function refresh() {
    setLoadingBookings(true);
    setLoadingBalances(true);
    
    // ✅ Load bookings and balances independently (non-blocking)
    getMyBookings().then(data => {
      // Normalize shapes (supports {unscheduled, upcoming, completed} OR a single array)
      const all: Booking[] = Array.isArray((data as any)?.all)
        ? (data as any).all
        : [
            ...((data?.unscheduled as Booking[]) ?? []),
            ...((data?.upcoming as Booking[]) ?? []),
            ...((data?.completed as Booking[]) ?? []),
          ];

      const byStatus = (status: string) => all.filter((b) => b.status === status);

      // Unscheduled can be:
      //  - paid booking without slot -> PENDING_SLOT
      //  - demo booking created without times -> PENDING
      const uns: Booking[] =
        (data?.unscheduled as Booking[]) ??
        all.filter((b) => b.status === "PENDING_SLOT" || b.status === "PENDING");

      const upc: Booking[] =
        (data?.upcoming as Booking[]) ?? byStatus("CONFIRMED");

      // Trust backend's completed array (based on endTime < now)
      // Also include any bookings with endTime in the past that aren't canceled
      const backendCompleted = (data?.completed as Booking[]) ?? [];
      const frontendCompleted = all.filter(
        (b) => b.endTime && new Date(b.endTime) < new Date() && b.status !== "CANCELED"
      );
      const comp: Booking[] = Array.from(
        new Map([...backendCompleted, ...frontendCompleted].map((b) => [b.id, b])).values()
      );

      // Sorts
      const getCreated = (b: Booking) =>
        b.createdAt ? new Date(b.createdAt).getTime() : 0;

      const getStart = (b: Booking) =>
        b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;

      const getEnd = (b: Booking) =>
        b.endTime ? new Date(b.endTime).getTime() : 0;

      setUnscheduled(
        [...uns].sort((a, b) => getCreated(b) - getCreated(a))
      );
      setUpcoming(
        [...upc].sort((a, b) => getStart(a) - getStart(b)) // nearest first
      );
      setCompleted(
        [...comp].sort((a, b) => getEnd(b) - getEnd(a)) // most recent first
      );

      // If redirected from payment success, auto-open the first unscheduled booking
      const prompt =
        params.get("promptSelect") === "1" ||
        localStorage.getItem("PROMPT_SELECT_SLOT") === "1";

      if (prompt && uns.length > 0) {
        openPickerFor(uns[0]);
      }

      if (prompt) {
        params.delete("promptSelect");
        setParams(params, { replace: true });
        localStorage.removeItem("PROMPT_SELECT_SLOT");
      }
    })
    .catch(err => {
      console.error('Failed to load bookings:', err);
      showError('Failed to load bookings');
    })
    .finally(() => setLoadingBookings(false));
    
    // Load balances independently
    api.get('/students/me/token-balances')
      .then(res => {
        const balances = Array.isArray(res.data) ? res.data : [];
        const balanceMap = new Map<string, number>();
        balances.forEach((b: any) => {
          if (b.tutorId) {
            balanceMap.set(b.tutorId, Number(b.balance || 0));
          }
        });
        setTokenBalances(balanceMap);
      })
      .catch(() => setTokenBalances(new Map()))
      .finally(() => setLoadingBalances(false));

    getMyReviews()
      .then((items) => {
        const map = new Map<string, number>();
        items.forEach((r) => {
          if (r.bookingId) map.set(r.bookingId, r.rating);
        });
        setReviewMap(map);
      })
      .catch(() => setReviewMap(new Map()));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openReviewModal(booking: Booking) {
    setReviewBooking(booking);
    setReviewRating(0);
    setReviewComment("");
    setReviewOpen(true);
  }

  async function submitReview() {
    if (!reviewBooking || !reviewBooking.id) {
      showError("Invalid booking selected.");
      return;
    }
    if (reviewRating < 1 || reviewRating > 5) {
      showError("Please select a rating.");
      return;
    }
    // Ensure bookingId is a valid CUID string (not UUID - Prisma uses CUID)
    const bookingId = String(reviewBooking.id).trim();
    if (!bookingId || bookingId.length < 10) {
      showError("Invalid booking ID.");
      return;
    }
    
    // Validate bookingId format (CUID format: starts with 'c' and is 25 chars, or at least 10 chars)
    if (!/^[a-z0-9]{10,}$/i.test(bookingId)) {
      console.error("Invalid booking ID format:", bookingId);
      showError("Invalid booking ID format.");
      return;
    }
    
    try {
      setReviewSubmitting(true);
      await createReview({
        bookingId,
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      });
      showSuccess("Thanks for your review!");
      setReviewMap((prev) => new Map(prev).set(bookingId, reviewRating));
      setReviewOpen(false);
      await refresh(); // Refresh to update review status
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || "Failed to submit review";
      console.error("Review submission error:", err);
      // Check if it's a validation error about bookingId
      if (errorMsg.includes("bookingId") || errorMsg.includes("UUID")) {
        console.error("Booking ID validation failed. Booking ID:", bookingId, "Type:", typeof bookingId);
        showError("Invalid booking ID. Please refresh the page and try again.");
      } else {
        showError(errorMsg);
      }
    } finally {
      setReviewSubmitting(false);
    }
  }

  useEffect(() => {
    const confirmed = [...upcoming, ...completed].filter((b) => b.status === "CONFIRMED");
    if (confirmed.length === 0) {
      setMeetingLinks(new Map());
      return;
    }

    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        confirmed.map(async (b) => {
          try {
            const detail = await getBookingDetails(b.id);
            return [b.id, detail?.meetingUrl as string | undefined] as const;
          } catch (err) {
            console.error('Failed to load booking details', b.id, err);
            return [b.id, (b as any)?.meetingUrl as string | undefined] as const;
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
  }, [upcoming, completed]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Enhanced Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-indigo-600" />
            My Bookings
          </h1>
          <p className="text-slate-600">Manage your tutoring sessions and schedule new classes</p>
        </div>

        {/* Quick Stats */}
        {!loadingBookings && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex items-center gap-4">
              <div className="p-3 bg-indigo-100 rounded-lg">
                <Calendar className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Upcoming</p>
                <p className="text-2xl font-bold text-gray-900">{upcoming.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex items-center gap-4">
              <div className="p-3 bg-emerald-100 rounded-lg">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Completed</p>
                <p className="text-2xl font-bold text-gray-900">{completed.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex items-center gap-4">
              <div className="p-3 bg-amber-100 rounded-lg">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Awaiting Slot</p>
                <p className="text-2xl font-bold text-gray-900">{unscheduled.length}</p>
              </div>
            </div>
          </div>
        )}

        {loadingBookings ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-4 text-slate-600">Loading your bookings...</p>
          </div>
        ) : (
          <>
            {/* Tutors with tokens but no pending booking */}
            {!loadingBalances && Array.from(tokenBalances.entries()).filter(([tutorId, balance]) => 
        balance > 0 && !unscheduled.some(b => b.tutor?.id === tutorId)
      ).length > 0 && (
        <Section
          title="Schedule with Your Tokens"
          emptyNote=""
        >
          {Array.from(tokenBalances.entries())
            .filter(([tutorId, balance]) => 
              balance > 0 && !unscheduled.some(b => b.tutor?.id === tutorId)
            )
            .map(([tutorId, balance]) => {
              // Find tutor info from upcoming or completed bookings
              const tutorInfo = [...upcoming, ...completed].find(b => b.tutor?.id === tutorId)?.tutor;
              if (!tutorInfo) return null;
              
              return (
                <div key={tutorId} className="bg-white rounded-xl border border-emerald-200 shadow-sm hover:shadow-md transition p-5 bg-gradient-to-r from-white to-emerald-50">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900">{tutorInfo.name || "Tutor"}</h3>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-emerald-100">
                          <Coins className="h-5 w-5 text-emerald-700" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-600 uppercase tracking-wide">Available Balance</p>
                          <p className="text-2xl font-bold text-emerald-700">{balance.toFixed(1)} tokens</p>
                          {balance <= 1 && (
                            <p className="text-xs text-amber-600 font-semibold mt-1">⚠️ Low balance</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await api.post(`/bookings/reserve-with-tokens/${tutorId}`);
                          await refresh();
                          showSuccess('Tokens reserved! You can now schedule your class.');
                        } catch (err: any) {
                          showError(err.response?.data?.message || 'Failed to reserve tokens');
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 transition transform hover:scale-105"
                    >
                      <CalendarPlus2 size={18} /> Schedule Class
                    </button>
                  </div>
                </div>
              );
            })}
        </Section>
      )}

      {/* Awaiting slot selection */}
      <Section
        title="Awaiting Slot Selection"
        emptyNote="No bookings awaiting a slot."
      >
        {unscheduled.map((b) => (
          <BookingCard
            key={b.id}
            booking={b}
            meetingLink={meetingLinks.get(b.id)}
            tokenBalance={tokenBalances.get(b.tutor?.id || '')}
            actions={
              <div className="flex gap-2">
                <button
                  onClick={() => openPickerFor(b)}
                  className="inline-flex items-center gap-2 rounded-xl bg-ocean-700 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-800"
                >
                  <CalendarPlus2 className="h-4 w-4" />
                  Select Slot
                </button>
                <button
                  onClick={() => handleCancel(b)}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            }
          />
        ))}
      </Section>

      {/* Upcoming */}
      <Section title="Upcoming Sessions" emptyNote="No upcoming sessions yet.">
        {upcoming.map((b) => (
          <BookingCard 
            key={b.id} 
            booking={b}
            meetingLink={meetingLinks.get(b.id)}
            actions={
              <button
                onClick={() => handleCancel(b)}
                className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4" />
                Cancel
              </button>
            }
          />
        ))}
      </Section>

      {/* Completed */}
      <Section title="Completed Sessions" emptyNote="No completed sessions yet.">
        {completed.map((b) => (
          <BookingCard
            key={b.id}
            booking={b}
            meetingLink={meetingLinks.get(b.id)}
            actions={
              reviewMap.has(b.id) ? (
                <div className="text-xs font-semibold text-emerald-700">Reviewed</div>
              ) : (
                <button
                  onClick={() => openReviewModal(b)}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
                >
                  <Star className="h-4 w-4" />
                  Leave Review
                </button>
              )
            }
          />
        ))}
      </Section>
        </>
      )}

      {/* Slot Picker Modal */}
      {pickerBooking && (
        <SlotPicker
          open={pickerOpen}
          onClose={closePicker}
          bookingId={pickerBooking.id}
          tutorId={pickerBooking.tutor.id}
          onAssigned={async () => {
            await refresh();
            // Refresh token balances after slot assignment
            try {
              const res = await api.get('/students/me/token-balances');
              const balances = Array.isArray(res.data) ? res.data : [];
              const balanceMap = new Map() as Map<string, number>;
              balances.forEach((b: any) => {
                if (b.tutorId) {
                  balanceMap.set(b.tutorId, Number(b.balance || 0));
                }
              });
              setTokenBalances(balanceMap);
            } catch (e) {
              console.error('Failed to refresh token balances:', e);
            }
            // Refresh demo status if this was a demo booking
            if (pickerBooking?.isDemo) {
              window.dispatchEvent(new CustomEvent('demo-status-changed', { 
                detail: { tutorId: pickerBooking.tutorId } 
              }));
            }
          }}
        />
      )}

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmCancel}
        title="Cancel Booking"
        message={confirmMessage}
        confirmText="Yes, Cancel"
        cancelText="No, Keep It"
        variant="warning"
        isLoading={cancelling}
      />

      {/* Review Modal */}
      {reviewOpen && reviewBooking && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="text-lg font-semibold">Rate your session</h3>
              <button className="p-1 rounded hover:bg-slate-100" onClick={() => setReviewOpen(false)}>
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <div className="text-sm text-slate-600 mb-2">Tutor</div>
                <div className="font-medium">{reviewBooking.tutor?.name || "Tutor"}</div>
              </div>

              <div>
                <div className="text-sm text-slate-600 mb-2">Your rating</div>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setReviewRating(n)}
                      className={`rounded-full p-2 ${
                        n <= reviewRating ? "text-amber-500" : "text-slate-300"
                      }`}
                      aria-label={`Rate ${n}`}
                    >
                      <Star className="h-6 w-6 fill-current" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-600 mb-2">Comments (optional)</label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  placeholder="Share a quick note about your experience..."
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
              <button
                className="rounded-xl border px-4 py-2 hover:bg-slate-50"
                onClick={() => setReviewOpen(false)}
                disabled={reviewSubmitting}
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-amber-500 px-4 py-2 text-white hover:bg-amber-600 disabled:opacity-60"
                onClick={submitReview}
                disabled={reviewSubmitting}
              >
                {reviewSubmitting ? "Submitting..." : "Submit Review"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function Section({
  title,
  emptyNote,
  children,
}: {
  title: string;
  emptyNote: string;
  children: React.ReactNode;
}) {
  const hasChildren =
    Array.isArray(children) ? (children as any[]).length > 0 : !!children;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        {hasChildren && (
          <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
            {Array.isArray(children) ? (children as any[]).length : 1}
          </span>
        )}
      </div>
      {!hasChildren ? (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
          <AlertCircle className="h-6 w-6 text-slate-400 mx-auto mb-2" />
          <p className="text-slate-500">{emptyNote}</p>
        </div>
      ) : (
        <div className="grid gap-4">{children}</div>
      )}
    </div>
  );
}

function BookingCard({
  booking,
  actions,
  tokenBalance,
  meetingLink,
}: {
  booking: Booking;
  actions?: React.ReactNode;
  tokenBalance?: number;
  meetingLink?: string;
}) {
  const {
    tutor,
    startTime,
    endTime,
    status,
    tokensCharged,
    payment,
    isDemo,
  } = booking;
  
  // Phase 4: Cast to check for group session and meeting link
  const groupBooking = booking as any;
  const isGroupSession = groupBooking.isGroupSession || false;
  const meetingUrl = meetingLink || groupBooking.meetingUrl;
  const joinUrl = meetingUrl?.startsWith("livekit:") || meetingUrl?.startsWith("webrtc:")
    ? `/class/${booking.id}`
    : meetingUrl;
  const currentEnrollment = groupBooking.currentEnrollment || 1;
  const maxStudents = groupBooking.maxStudents || 1;

  const statusMap: Record<string, { label: string; color: string }> = {
    CONFIRMED: { label: "Confirmed", color: "text-blue-600" },
    PENDING: { label: "Action required", color: "text-amber-600" }, // demo pending slot
    PENDING_SLOT: { label: "Action required", color: "text-amber-600" }, // paid pending slot
    COMPLETED: { label: "Completed", color: "text-green-600" },
    CANCELED: { label: "Cancelled", color: "text-red-500" },
  };

  const statusMeta = statusMap[status] ?? {
    label: status,
    color: "text-gray-500",
  };

  const startDateText = startTime
    ? new Date(startTime).toLocaleDateString()
    : "—";
  const timeText = startTime
    ? new Date(startTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  const endDateText = endTime
    ? new Date(endTime).toLocaleDateString()
    : undefined;

  return (
    <div className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition p-5 ${
      status === 'CANCELED' ? 'opacity-75 bg-slate-50' : ''
    } ${status === 'COMPLETED' ? 'bg-emerald-50' : ''}`}>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        {/* Left: Tutor Info & Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900">
                {tutor?.name || "Unknown Tutor"}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                  status === 'CONFIRMED' ? 'bg-indigo-100 text-indigo-700' :
                  status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                  status === 'CANCELED' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {statusMeta.label} {isDemo && "(Demo)"}
                </span>
              </div>
            </div>
          </div>

          {/* Session Details */}
          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-600" />
              <span className="font-medium text-gray-800">{startDateText}</span>
              {endDateText && startDateText !== endDateText && <span>→ {endDateText}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-600" />
              <span className="font-medium text-gray-800">{timeText}</span>
            </div>
          </div>

          {/* Token Balance Warning */}
          {(status === "PENDING_SLOT" || status === "PENDING") && tokenBalance !== undefined && tokenBalance > 0 && (
            <div className="mt-3 p-2 rounded-lg bg-emerald-50 border border-emerald-200 inline-block">
              <div className="flex items-center gap-2 text-sm">
                <Coins className="h-4 w-4 text-emerald-600" />
                <span className="text-emerald-700 font-medium">
                  {tokenBalance.toFixed(1)} tokens available
                </span>
                {tokenBalance <= 1 && (
                  <span className="ml-2 text-xs text-amber-600 font-medium">⚠️ Low</span>
                )}
              </div>
            </div>
          )}

          {/* Group Session Info */}
          {isGroupSession && (
            <div className="mt-3 flex items-center gap-2 text-sm bg-blue-50 p-2 rounded-lg border border-blue-200">
              <Users size={16} className="text-blue-600 flex-shrink-0" />
              <span className="text-gray-700">
                <span className="font-semibold text-blue-700">{currentEnrollment}/{maxStudents}</span> students enrolled
              </span>
            </div>
          )}

          {/* Join Link */}
          {joinUrl && status === "CONFIRMED" && endTime && new Date(endTime) > new Date() && (
            <div className="mt-3">
              <a
                href={joinUrl}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
              >
                <Video size={16} />
                Join Class
                <ExternalLink size={14} />
              </a>
            </div>
          )}
        </div>

        {/* Right: Pricing & Actions */}
        <div className="flex flex-col items-end gap-3 md:w-48">
          {/* Price */}
          <div className="text-right">
            <p className="text-xs text-slate-600 uppercase tracking-wide">Amount</p>
            <p className="text-2xl font-bold text-gray-900 flex items-center justify-end gap-1">
              <IndianRupee size={20} className="text-indigo-600" />
              {(() => {
                if (isDemo) return "0";
                if (startTime && endTime) {
                  const diffMs = new Date(endTime).getTime() - new Date(startTime).getTime();
                  const hours = Math.max(0, diffMs / 3_600_000);
                  return Math.round((tutor?.hourlyRate || 0) * hours);
                }
                const fallbackTokens = Number(tokensCharged || 0);
                return Math.round((tutor?.hourlyRate || 0) * (fallbackTokens || 0));
              })()}
            </p>
          </div>

          {/* Receipt Download */}
          {payment && (
            <div className="w-full">
              <p className="text-xs text-slate-600 text-right mb-1">
                {payment.currency} • {payment.status}
              </p>
              <button
                onClick={() => downloadReceipt(payment.id)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition"
              >
                <FileDown size={16} /> Receipt
              </button>
            </div>
          )}

          {/* Actions */}
          {actions && <div className="w-full">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
