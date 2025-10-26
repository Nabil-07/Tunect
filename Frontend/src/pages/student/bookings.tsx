import { useEffect, useState } from "react";
import {
  FileDown,
  Calendar,
  Clock,
  User,
  IndianRupee,
  AlertCircle,
  CalendarPlus2,
} from "lucide-react";
import {
  getMyBookings,
  type BookingDto,
} from "../../services/bookingsService";
import { downloadReceipt } from "../../services/paymentsService";
import SlotPicker from "../../components/SlotPicker";
import { useSearchParams } from "react-router-dom";

type Booking = BookingDto;

export default function MyBookings() {
  const [params, setParams] = useSearchParams();

  const [unscheduled, setUnscheduled] = useState<Booking[]>([]);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [completed, setCompleted] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // slot picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerBooking, setPickerBooking] = useState<Booking | null>(null);

  function openPickerFor(b: Booking) {
    setPickerBooking(b);
    setPickerOpen(true);
  }

  function closePicker() {
    setPickerOpen(false);
    setPickerBooking(null);
  }

  async function refresh() {
    setLoading(true);
    try {
      const data = await getMyBookings();

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
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-500">Loading your bookings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">
        My Bookings
      </h1>

      {/* Awaiting slot selection */}
      <Section
        title="Awaiting Slot Selection"
        emptyNote="No bookings awaiting a slot."
      >
        {unscheduled.map((b) => (
          <BookingCard
            key={b.id}
            booking={b}
            actions={
              <button
                onClick={() => openPickerFor(b)}
                className="inline-flex items-center gap-2 rounded-xl bg-ocean-700 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-800"
              >
                <CalendarPlus2 className="h-4 w-4" />
                Select Slot
              </button>
            }
          />
        ))}
      </Section>

      {/* Upcoming */}
      <Section title="Upcoming Sessions" emptyNote="No upcoming sessions yet.">
        {upcoming.map((b) => (
          <BookingCard key={b.id} booking={b} />
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
}: {
  booking: Booking;
  actions?: React.ReactNode;
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
          <p className="text-gray-600 flex items-center gap-2">
            <User size={16} /> {tutor?.email || "—"}
          </p>
          <p className="text-gray-600 flex items-center gap-2">
            <Calendar size={16} /> {startDateText}
            {endDateText && ` - ${endDateText}`}
          </p>
          <p className="text-gray-600 flex items-center gap-2">
            <Clock size={16} /> {timeText}
          </p>
        </div>

        <div className="text-right">
          <p className={`font-semibold ${statusMeta.color}`}>
            {statusMeta.label} {isDemo ? "(Demo)" : ""}
          </p>
          <p className="flex items-center justify-end gap-1 text-gray-700 font-medium">
            <IndianRupee size={16} />{" "}
            {Math.max(0, Number(tokensCharged || 0)) * 100}
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
