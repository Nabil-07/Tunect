// src/pages/tutor/public-profile.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getTutor } from '../../services/tutorService';            // ⬅️ no named `Tutor` import
import { api } from '../../lib/apiClient';
import { useDisplayCurrency } from '../../hooks/useDisplayCurrency';
import { formatCurrency } from '../../utils/currency';
import BuyTokensButton from '../../components/BuyTokensButton';
import { createDemoBooking } from '../../services/bookingsService';

type BookableSlot = { startTime: string; endTime: string };

// keep it local so we don't rely on a type export from the service
type TutorPublic = {
  id: string;
  name?: string;
  subject?: string;
  subjects?: string[];
  avatarUrl?: string;
  hourlyRate?: number;
  bio?: string;
};

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
function sameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }

export default function TutorPublicProfile() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const isDemoIntent = useMemo(
    () => new URLSearchParams(location.search).get('demo') === '1',
    [location.search],
  );
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );

  const { currency, rates } = useDisplayCurrency();
  const r = (code: string) => rates[code] ?? 1; // USD->code

  const [tutor, setTutor] = useState<TutorPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [bookable, setBookable] = useState<BookableSlot[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const res: Date[] = [];

    // Monday-first grid
    const padStart = (start.getDay() + 6) % 7;
    for (let i = 0; i < padStart; i++) {
      res.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() - (padStart - i)));
    }

    // month days
    for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      res.push(new Date(d));
    }

    // pad tail
    const padEnd = (7 - (res.length % 7)) % 7;
    for (let i = 1; i <= padEnd; i++) {
      res.push(new Date(end.getFullYear(), end.getMonth(), end.getDate() + i));
    }
    return res;
  }, [month]);

  const fetchSlots = useCallback(async (targetMonth: Date) => {
    if (!id) return [] as BookableSlot[];
    const from = startOfMonth(targetMonth).toISOString();
    const to = endOfMonth(targetMonth).toISOString();

    const params = { from, to, durationMin: 60, stepMin: 15 } as const;

    try {
      const { data } = await api.get(`/availability/tutors/${id}/bookable`, { params });
      const slots = Array.isArray(data?.slices) ? data.slices : [];
      return (slots as BookableSlot[]).filter((s) => s?.startTime && s?.endTime);
    } catch {
      try {
        const { data } = await api.get(`/availability/tutor/${id}/bookable`, { params });
        const slots = Array.isArray(data?.slices) ? data.slices : Array.isArray(data) ? data : [];
        return (slots as BookableSlot[]).filter((s) => s?.startTime && s?.endTime);
      } catch {
        try {
          const { data } = await api.get(`/availability/bookable/${id}`, { params });
          const slots = Array.isArray(data?.slices) ? data.slices : Array.isArray(data) ? data : [];
          return (slots as BookableSlot[]).filter((s) => s?.startTime && s?.endTime);
        } catch {
          return [] as BookableSlot[];
        }
      }
    }
  }, [id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const t = await getTutor(id!);
        if (!mounted) return;
        setTutor(t as TutorPublic);

        const slots = await fetchSlots(month);
        if (!mounted) return;
        setBookable(slots);
      } catch (e) {
        if (mounted) {
          setErr('Unable to load tutor.');
          setTutor(null);
          setBookable([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id, month, fetchSlots]);

  useEffect(() => {
    if (location.hash === '#slots') {
      const anchor = document.getElementById('slots-anchor');
      anchor?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash, bookable.length]);

  async function bookSlot(slot: BookableSlot) {
    if (!id) return;
    try {
      setBusy(true);

      if (isDemoIntent) {
        // schedule demo immediately in the chosen slice
        await createDemoBooking({
          tutorId: id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          notes: 'Demo from public profile',
          timezone, // important: backend uses this for toUtc()
        });
      } else {
        // paid booking flow (requires tokens)
        await api.post(
          '/bookings',
          { tutorId: id, startTime: slot.startTime, endTime: slot.endTime, notes: 'Booked from public profile' },
          { params: { tz: timezone } },
        );
      }

      // refresh slots so the taken one disappears for everyone
      const slots = await fetchSlots(month);
      setBookable(slots);
      setToast(isDemoIntent ? 'Demo slot confirmed!' : 'Booking created!');
    } catch (e: any) {
      console.error(e);
      const status = e?.response?.status;
      if (status === 409 || status === 400) {
        setToast('That slot was just taken. Please pick another.');
        const slots = await fetchSlots(month);
        setBookable(slots);
      } else {
        setToast('Could not book. Please try again.');
      }
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  if (loading) {
    return (
      <main className="container mx-auto py-10 px-4">
        <div className="card h-32 animate-pulse bg-gray-100 rounded-md" />
      </main>
    );
  }

  if (err || !tutor) {
    return (
      <main className="container mx-auto py-10 px-4">
        <div className="text-sm text-red-700">{err || 'Tutor not found.'}</div>
      </main>
    );
  }

  const priceInDisplay = typeof tutor.hourlyRate === 'number'
    ? Math.round((tutor.hourlyRate * (r(currency) / Math.max(r('INR'), 1e-9)) + Number.EPSILON) * 100) / 100
    : undefined;

  return (
    <main className="container mx-auto py-10 px-4">
      {toast && <div className="mb-4 p-3 rounded bg-black text-white inline-block">{toast}</div>}

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="card p-5 rounded-xl border bg-white shadow-sm">
          <img
            src={
              tutor.avatarUrl ||
              `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(tutor.name || 'Tutor')}`
            }
            alt={tutor.name || 'Tutor'}
            className="w-full rounded-2xl object-cover aspect-square"
          />
          <h1 className="mt-4 text-2xl font-bold">{tutor.name}</h1>
          <div className="text-sm text-slate-600 mt-1">
            {tutor.subject || tutor.subjects?.[0] || 'Subject not specified'}
          </div>
          <div className="mt-3 text-sm">
            {priceInDisplay != null ? (
              <span><b>{formatCurrency(priceInDisplay, currency)}</b> / hour</span>
            ) : (
              <span>--</span>
            )}
          </div>

          <div className="mt-5 border-t pt-4">
            <h3 className="text-sm font-semibold mb-2">Purchase tokens</h3>
            <p className="text-[12px] text-slate-600 mb-2">
              Each token costs ₹{tutor.hourlyRate ?? '--'} (paid via Razorpay).
            </p>
            <BuyTokensButton
              tutorId={id!}
              defaultTokens={10}
              onSuccess={() => setToast('Payment successful! Tokens credited.')}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5 rounded-xl border bg-white shadow-sm">
            <h2 className="text-lg font-semibold mb-2">About</h2>
            <p className="text-sm text-slate-700">{tutor.bio || 'This tutor has not added a bio yet.'}</p>
          </div>

          <div id="slots-anchor" className="card p-5 rounded-xl border bg-white shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold">Available Slots</h2>
                {isDemoIntent && (
                  <p className="text-xs text-emerald-600 mt-1">Pick a slot to confirm your free demo.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-2 py-1 border rounded"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <div className="font-medium">
                  {month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                </div>
                <button
                  className="px-2 py-1 border rounded"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 text-xs text-slate-500 mb-2">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                <div key={d} className="text-center">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {days.map((d, i) => {
                const slotsForDay = bookable.filter(s => sameDay(new Date(s.startTime), d));
                const inMonth = d.getMonth() === month.getMonth();
                return (
                  <div key={i} className={`border rounded p-2 ${inMonth ? 'bg-white' : 'bg-slate-50'}`}>
                    <div className="text-xs mb-1 font-medium">{d.getDate()}</div>
                    <div className="space-y-1">
                      {slotsForDay.length === 0 ? (
                        <div className="text-[11px] text-slate-400">No slots</div>
                      ) : (
                        slotsForDay.map((s, idx) => (
                          <div key={`${s.startTime}-${idx}`} className="flex items-center justify-between gap-2">
                            <div className="text-[11px]">
                              {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {' – '}
                              {new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <button
                              disabled={busy}
                              onClick={() => bookSlot(s)}
                              className="text-[11px] px-2 py-0.5 rounded bg-blue-600 text-white hover:opacity-90 disabled:opacity-60"
                            >
                              {busy ? '...' : 'Book'}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {bookable.length === 0 && (
              <div className="mt-4 text-xs text-slate-500">
                No slots are currently open. We'll notify you once the tutor adds availability.
              </div>
            )}
          </div>

          <div className="card p-5 rounded-xl border bg-white shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Reviews</h2>
            <p className="text-sm text-slate-600">This section will be wired soon with live reviews.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
