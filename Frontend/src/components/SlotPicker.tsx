import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, Clock, Loader2, RotateCw, X } from 'lucide-react';
import { assignSlot, getTutorAvailability, listBookings } from '../services/bookingsService';
import { addToWaitlist } from '../services/waitlistService';
import NotificationModal from './common/NotificationModal';

type AvailabilitySlot = {
  id?: string;
  startTime: string; // ISO
  endTime: string;   // ISO
};

export default function SlotPicker({
  open,
  bookingId,
  tutorId,
  tz,
  days = 14,
  onClose,
  onAssigned,
}: {
  open: boolean;
  bookingId: string;
  tutorId: string;
  tz?: string;          // optional IANA timezone header passthrough
  days?: number;        // how many days ahead to fetch (default 14)
  onClose: () => void;
  onAssigned: (payload: { startTime: string; endTime: string }) => void;
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
      
      // Fetch availability and booked slots in parallel
      const [availabilityRes, bookedRes] = await Promise.all([
        getTutorAvailability(tutorId, from.toISOString(), to.toISOString(), tz),
        listBookings({ tutorId, status: 'CONFIRMED', tz }).catch(() => [])
      ]);
      
      setSlots(Array.isArray(availabilityRes) ? availabilityRes : []);
      
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
  }, [open, tutorId, days, tz]);

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
    return Array.from(map.entries()).map(([day, arr]) => ({
      day,
      items: arr.sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime)),
    }));
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-ocean-700" />
            <h3 className="text-lg font-semibold">Select an available slot</h3>
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
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-600">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading availability…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : grouped.length === 0 ? (
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-center">
              <p className="text-sm font-medium text-purple-900 mb-2">
                No available slots at the moment
              </p>
              <p className="text-xs text-purple-700">
                Click "Notify Me" below to get an email when this tutor adds new availability
              </p>
            </div>
          ) : (
            grouped.map(({ day, items }) => (
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
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                          active
                            ? 'border-ocean-600 bg-ocean-50 text-ocean-900'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Clock className="h-4 w-4" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
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
        message="You will be notified via email when this tutor adds new availability."
        type="success"
        confirmText="Got it!"
      />
    </div>
  );
}
