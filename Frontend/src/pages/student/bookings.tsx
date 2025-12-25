import { useEffect, useState } from "react";
import {
  FileDown,
  Calendar,
  Clock,
  User,
  IndianRupee,
  AlertCircle,
  CalendarPlus2,
  XCircle,
  Video,
  Users,
  ExternalLink,
  Coins,
} from "lucide-react";
import {
  getMyBookings,
  type BookingDto,
  cancelBooking,
} from "../../services/bookingsService";
import { downloadReceipt } from "../../services/paymentsService";
import SlotPicker from "../../components/SlotPicker";
import { useSearchParams } from "react-router-dom";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../contexts/ToastContext";
import api from "../../lib/apiClient";
import Loader from "../../components/common/Loader";

type Booking = BookingDto;

export default function MyBookings() {
  const [params, setParams] = useSearchParams();
  const { showSuccess, showError } = useToast();

  const [unscheduled, setUnscheduled] = useState<Booking[]>([]);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [completed, setCompleted] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenBalances, setTokenBalances] = useState<Map<string, number>>(new Map());

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
      await refresh();
      showSuccess('Booking cancelled successfully');
      setConfirmOpen(false);
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

    if (!booking.startTime) {
      return { percent: 100, message: 'Full refund to your token balance.' };
    }

    const now = new Date();
    const start = new Date(booking.startTime);
    const hoursUntil = (start.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntil >= 24) {
      return { percent: 100, message: '100% refund (cancelled 24+ hours before session).' };
    } else if (hoursUntil > 0) {
      return { percent: 0, message: 'No refund (must cancel 24+ hours before session).' };
    } else {
      return { percent: 0, message: 'Cannot cancel - session has already started or passed.' };
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const [data, balancesRes] = await Promise.all([
        getMyBookings(),
        api.get('/students/me/token-balances').catch(() => ({ data: [] })),
      ]);

      // Build token balance map
      const balances = Array.isArray(balancesRes.data) ? balancesRes.data : [];
      const balanceMap = new Map<string, number>();
      balances.forEach((b: any) => {
        if (b.tutorId) {
          balanceMap.set(b.tutorId, Number(b.balance || 0));
        }
      });
      setTokenBalances(balanceMap);

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

      const comp: Booking[] =
        (data?.completed as Booking[]) ?? byStatus("COMPLETED");

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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <Loader message="Loading your bookings..." />;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">
        My Bookings
      </h1>

      {/* Tutors with tokens but no pending booking */}
      {Array.from(tokenBalances.entries()).filter(([tutorId, balance]) => 
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
                <div key={tutorId} className="bg-white shadow rounded-xl p-5 border hover:shadow-md transition">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">{tutorInfo.name || "Tutor"}</h3>
                      <div className="mt-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 inline-block">
                        <div className="flex items-center gap-2 text-sm">
                          <Coins className="h-4 w-4 text-emerald-600" />
                          <span className="text-emerald-700 font-medium">
                            {balance.toFixed(1)} tokens available
                          </span>
                          {balance <= 1 && (
                            <span className="ml-2 text-xs text-amber-600 font-medium">Low balance!</span>
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
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      <CalendarPlus2 size={16} /> Schedule Class
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
          <BookingCard key={b.id} booking={b} />
        ))}
      </Section>

      {/* Slot Picker Modal */}
      {pickerBooking && (
        <SlotPicker
          open={pickerOpen}
          onClose={closePicker}
          bookingId={pickerBooking.id}
          tutorId={pickerBooking.tutor.id}
          onAssigned={() => refresh()}
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
    <div className="mb-10">
      <h2 className="text-xl font-medium text-blue-600 mb-4">{title}</h2>
      {!hasChildren ? (
        <p className="flex items-center gap-2 text-gray-500">
          <AlertCircle className="h-4 w-4" /> {emptyNote}
        </p>
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
}: {
  booking: Booking;
  actions?: React.ReactNode;
  tokenBalance?: number;
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
  const meetingUrl = groupBooking.meetingUrl;
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
    <div className="bg-white shadow rounded-xl p-5 border hover:shadow-md transition">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">
            {tutor?.name || "Unknown Tutor"}
          </h3>
          
          {/* Token Balance for Awaiting Slot */}
          {(status === "PENDING_SLOT" || status === "PENDING") && tokenBalance !== undefined && tokenBalance > 0 && (
            <div className="mt-2 mb-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 inline-block">
              <div className="flex items-center gap-2 text-sm">
                <Coins className="h-4 w-4 text-emerald-600" />
                <span className="text-emerald-700 font-medium">
                  {tokenBalance.toFixed(1)} tokens remaining for this tutor
                </span>
                {tokenBalance <= 1 && (
                  <span className="ml-2 text-xs text-amber-600 font-medium">Low balance!</span>
                )}
              </div>
            </div>
          )}
          
          <p className="text-gray-600 flex items-center gap-2">
            <Calendar size={16} /> {startDateText}
            {endDateText && ` - ${endDateText}`}
          </p>
          <p className="text-gray-600 flex items-center gap-2">
            <Clock size={16} /> {timeText}
          </p>
          
          {/* Group Session Badge */}
          {isGroupSession && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <Users size={16} className="text-blue-600" />
              <span className="text-gray-700">
                Group Session ({currentEnrollment}/{maxStudents} students)
              </span>
            </div>
          )}
          
          {/* Google Meet Link */}
          {meetingUrl && status === "CONFIRMED" && (
            <div className="mt-2">
              <a
                href={meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                <Video size={16} />
                Join Google Meet
                <ExternalLink size={14} />
              </a>
            </div>
          )}
        </div>

        <div className="text-right">
          <p className={`font-semibold ${statusMeta.color}`}>
            {statusMeta.label} {isDemo ? "(Demo)" : ""}
          </p>
          <p className="flex items-center justify-end gap-1 text-gray-700 font-medium">
            <IndianRupee size={16} />{" "}
            {Math.max(0, Number(tokensCharged || 0))}
          </p>

          {/* Receipt download (if payment exists) */}
          {payment && (
            <div className="mt-2">
              <p className="text-sm text-gray-600">
                Payment: {(payment.amountInMinor ?? 0) / 100} {payment.currency} (
                {payment.status})
              </p>
              <button
                onClick={() => downloadReceipt(payment.id)}
                className="mt-1 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
              >
                <FileDown size={16} /> Download Receipt
              </button>
            </div>
          )}

          {/* Card actions (e.g., Select Slot) */}
          {actions && <div className="mt-3">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
