import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, Clock, Loader2, RotateCw, X } from 'lucide-react';
import { assignSlot, getTutorAvailability, listBookings } from '../services/bookingsService';
import { http as api } from '../api/http';
import { addToWaitlist } from '../services/waitlistService';
import NotificationModal from './common/NotificationModal';

type AvailabilitySlot = {
  id?: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  subject?: string;
  title?: string;
};

export default function SlotPicker({
  open,
  bookingId,
  tutorId,
  isDemo = false,
  tz,
  days = 14,
  onClose,
  onAssigned,
}: {
  readonly open: boolean;
  readonly bookingId: string;
  readonly tutorId: string;
  readonly isDemo?: boolean;
  readonly tz?: string;          // optional IANA timezone header passthrough
  readonly days?: number;        // how many days ahead to fetch (default 14)
  readonly onClose: () => void;
  readonly onAssigned: (payload: { startTime: string; endTime: string }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotification, setShowNotification] = useState(false);

  const dtDate = useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    []
  );
  const dtTime = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }),
    []
  );

  // Detect user's timezone for display
  const userTimezone = useMemo(() => {
    const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    // Get short abbreviation like "IST", "GST", "EST"
    const abbr = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value || tzName;
    return { name: tzName, abbr };
  }, []);

  const keyForSlot = (s: AvailabilitySlot) =>
    `${s.id ?? ''}::${s.startTime}::${s.endTime}`;

  const fetchSlots = useCallback(async () => {
    if (!open || !tutorId) return;
    setLoading(true);
    setError(null);
    try {
      const from = new Date();
      const to = new Date();
      to.setDate(to.getDate() + Math.max(1, days));
      const durationMin = isDemo ? 30 : 60;

      const params = { from: from.toISOString(), to: to.toISOString(), durationMin, stepMin: 15, _t: Date.now() } as const;
      const normalizeSlices = (data: any) => {
        if (Array.isArray(data?.slices)) return data.slices;
        if (Array.isArray(data)) return data;
        return [];
      };
      
      // Fetch availability and booked slots in parallel
      const [availabilityRes, bookedRes] = await Promise.all([
        (async () => {
          try {
            const { data } = await api.get(`/availability/tutor/${tutorId}/bookable`, { params });
            return normalizeSlices(data);
          } catch {
            try {
              const { data } = await api.get(`/availability/tutors/${tutorId}/bookable`, { params });
              return normalizeSlices(data);
            } catch {
              try {
              const { data } = await api.get(`/availability/bookable/${tutorId}`, { params });
              return normalizeSlices(data);
            } catch {
              return await getTutorAvailability(tutorId, from.toISOString(), to.toISOString(), tz);
              }
            }
          }
        })(),
        listBookings({ tutorId, status: 'CONFIRMED', tz }).catch(() => [])
      ]);
      
      const filtered = (Array.isArray(availabilityRes) ? availabilityRes : []).filter((s) => {
        const start = new Date(s.startTime).getTime();
        const end = new Date(s.endTime).getTime();
        return Number.isFinite(start) && Number.isFinite(end) && end > start;
      });
      const unique = new Map<string, AvailabilitySlot>();
      filtered.forEach((slot: any) => {
        const key = `${slot.startTime}::${slot.endTime}`;
        if (!unique.has(key)) {
          unique.set(key, {
            id: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            subject: slot.subject || slot.title,
            title: slot.title,
          });
        }
      });
      setSlots(Array.from(unique.values()));
      
      // Create a set of booked time ranges for quick lookup
      const booked = new Set<string>();
      if (Array.isArray(bookedRes)) {
        bookedRes.forEach(booking => {
          if (booking.startTime && booking.endTime) {
            booked.add(`${booking.startTime}::${booking.endTime}`);
          }
        });
      }
      setBookedSlots(booked);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load availability');
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [open, tutorId, isDemo, days, tz]);

  // initial + whenever reopened
  useEffect(() => {
    if (open) fetchSlots();
    // clear selection each open
    if (open) setSelectedKey(null);
  }, [open, fetchSlots]);

  const grouped = useMemo(() => {
    const map = new Map<string, AvailabilitySlot[]>();
    const now = new Date();
    
    for (const s of slots) {
      const slotKey = `${s.startTime}::${s.endTime}`;
      const startTime = new Date(s.startTime);
      
      // Skip if slot is already booked or in the past
      if (bookedSlots.has(slotKey) || startTime < now) {
        continue;
      }
      
      const label = dtDate.format(startTime);
      const arr = map.get(label) || [];
      arr.push(s);
      map.set(label, arr);
    }
    return Array.from(map.entries()).map(([day, arr]) => {
      const items = [...arr].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
      return { day, items };
    });
  }, [slots, bookedSlots, dtDate]);

  async function handleAssign() {
    if (!selectedKey) return;
    const s = slots.find((x) => keyForSlot(x) === selectedKey);
    if (!s) return;

    setSubmitting(true);
    setError(null);
    try {
      await assignSlot(
        bookingId,
        { startTime: s.startTime, endTime: s.endTime },
        tz
      );
      onAssigned({ startTime: s.startTime, endTime: s.endTime });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to assign slot');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNotifyMe() {
    setJoiningWaitlist(true);
    setError(null);
    try {
      // Add to waitlist with a flexible time range
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // Next 7 days
      
      await addToWaitlist({
        tutorId,
        requestedStartTime: now.toISOString(),
        requestedEndTime: futureDate.toISOString(),
        notes: `Notified from booking ${bookingId}`,
      });
      
      setShowNotification(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to join waitlist');
    } finally {
      setJoiningWaitlist(false);
    }
  }

  const handleNotificationClose = () => {
    setShowNotification(false);
    onClose();
  };

  if (!open) return null;

  let content: React.ReactNode;
  if (loading) {
    content = (
      <div className="flex items-center justify-center py-12 text-slate-600">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading availability…
      </div>
    );
  } else if (error) {
    content = (
      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  } else if (grouped.length === 0) {
    content = (
      <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-center">
        <p className="text-sm font-medium text-purple-900 mb-2">
          No available slots at the moment
        </p>
        <p className="text-xs text-purple-700">
          Click "Notify Me" below to get notified in the app when this tutor adds new availability
        </p>
      </div>
    );
  } else {
    content = grouped.map(({ day, items }) => (
      <div key={day} className="mb-4">
        <div className="mb-2 text-sm font-semibold text-slate-700">{day}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((s) => {
            const st = new Date(s.startTime);
            const et = new Date(s.endTime);
            const label = `${dtTime.format(st)} – ${dtTime.format(et)}`;
            const key = keyForSlot(s);
            const active = selectedKey === key;
            return (
              <button
                key={key}
                onClick={() => setSelectedKey(key)}
                className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2 text-sm transition ${
                  active
                    ? 'border-ocean-600 bg-ocean-50 text-ocean-900'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <span>{label}</span>
                </div>
                {(s.subject || s.title) && (
                  <span className="text-xs text-slate-600">
                    Subject: {s.subject || s.title}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    ));
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-ocean-700" />
            <h3 className="text-lg font-semibold">Select an available slot</h3>
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600" title={`Times shown in ${userTimezone.name}`}>
              {userTimezone.abbr} — your local time
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchSlots}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              title="Refresh availability"
              aria-label="Refresh availability"
            >
              <RotateCw size={18} />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 hover:bg-slate-100"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-auto p-4">
          {content}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          
          {grouped.length === 0 && !loading ? (
            <button
              disabled={joiningWaitlist}
              onClick={handleNotifyMe}
              className="rounded-xl bg-purple-600 px-4 py-2 font-medium text-white disabled:opacity-60 flex items-center gap-2"
            >
              {joiningWaitlist ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Joining…
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4" /> Notify Me
                </>
              )}
            </button>
          ) : (
            <button
              disabled={!selectedKey || submitting}
              onClick={handleAssign}
              className="rounded-xl bg-ocean-700 px-4 py-2 font-medium text-white disabled:opacity-60"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Assigning…
                </span>
              ) : (
                'Assign Slot'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Notification Modal */}
      <NotificationModal
        open={showNotification}
        onClose={handleNotificationClose}
        title="Added to Waitlist!"
        message="You will be notified in the app when this tutor adds new availability."
        type="success"
        confirmText="Got it!"
      />
    </div>
  );
}
