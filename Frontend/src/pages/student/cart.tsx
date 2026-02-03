// src/pages/student/cart.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingCart, CreditCard, ShieldCheck, CheckCircle, Calendar, Clock, TrendingUp } from 'lucide-react';
import { getTutorById, getTutorAvailability } from '../../services/tutorService';
import { useAuth } from '../../contexts/AuthContext';
import { useDisplayCurrency } from '../../hooks/useDisplayCurrency';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/apiClient';
import { useToast } from '../../contexts/ToastContext';

type Tutor = {
  id: string;
  name: string;
  subjectPrimary?: string;
  subjects?: string[];
  hourlyRate?: number;
  pricePerHour?: number;
  avatarUrl?: string | null;
};

export default function Cart() {
  const [sp] = useSearchParams();
  const tutorId = sp.get('tutorId') || sp.get('tutorid') || '';
  const isDemo = sp.get('demo') === '1';
  const nav = useNavigate();
  const { user } = useAuth();
  const { currency: displayCurrency, convertFromINR } = useDisplayCurrency();
  const { showError } = useToast();

  const displayStudentName = user?.name
    || (user?.email?.includes('@') ? user.email.split('@')[0] : '')
    || 'Student';

  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [qty, setQty] = useState<number>(() => {
    const q = Number(sp.get('tokens') || 5);
    return Number.isFinite(q) ? Math.max(5, q) : 5;
  }); // tokens count
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<Array<{ startTime: string; endTime: string }>>([]);
  const [activityInfo, setActivityInfo] = useState<{
    lastActiveDate: string | null;
    activeDaysCount: number;
    activityFrequency: string;
  } | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(true);

  useEffect(() => {
    if (!tutorId) {
      nav('/find-tutors', { replace: true });
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const t = await getTutorById(tutorId);
        setTutor({
          id: t.id,
          name: t.name,
          subjectPrimary: (t as any).subject ?? t.subjectPrimary,
          subjects: t.subjects,
          hourlyRate: t.hourlyRate ?? t.pricePerHour ?? 0,
          pricePerHour: t.pricePerHour,
          avatarUrl: t.avatarUrl ?? null,
        });
        
        // Load availability slots and activity info
        const from = new Date();
        const to = new Date();
        to.setDate(to.getDate() + 14); // Next 14 days
        const params = { from: from.toISOString(), to: to.toISOString(), durationMin: 60, stepMin: 15 } as const;

        const normalizeSlices = (data: any) => {
          if (Array.isArray(data?.slices)) return data.slices;
          if (Array.isArray(data)) return data;
          return [];
        };
        
        try {
          const [slots, activity] = await Promise.all([
            (async () => {
              try {
                const { data } = await api.get(`/availability/tutor/${tutorId}/bookable`, { params });
                return normalizeSlices(data);
              } catch {
                try {
                  const { data } = await api.get(`/availability/bookable/${tutorId}`, { params });
                  return normalizeSlices(data);
                } catch {
                  return await getTutorAvailability(tutorId, from.toISOString(), to.toISOString());
                }
              }
            })(),
            api.get(`/tutors/${tutorId}/activity`).then(res => res.data).catch(() => null),
          ]);

          setAvailableSlots(Array.isArray(slots) ? slots.slice(0, 10) : []); // Show first 10 slots
          setActivityInfo(activity);
        } catch (e) {
          console.error('Failed to load tutor info:', e);
        }
      } finally {
        setLoading(false);
        setLoadingSlots(false);
      }
    })();
  }, [tutorId, nav]);

  const hourly = tutor?.hourlyRate ?? tutor?.pricePerHour ?? 0; // INR

  const subtotal = useMemo(() => {
    const h = Number.isFinite(hourly) ? Number(hourly) : 0;
    const t = Number.isFinite(qty) ? Number(qty) : 0;
    return h * t; // INR
  }, [hourly, qty]);
  const subtotalDisplay = useMemo(
    () => convertFromINR(subtotal) ?? subtotal,
    [subtotal, convertFromINR]
  );

  const onQtyChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const n = Number.parseInt(e.target.value || '5', 10);
    if (Number.isNaN(n)) return;
    setQty(Math.max(5, n));
  };

  const slotsSection = (() => {
    if (loadingSlots) {
      return <div className="mt-6 h-24 animate-pulse rounded-lg bg-slate-100" />;
    }
    if (availableSlots.length > 0) {
      return (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Available Slots (Next 14 Days)
          </h3>
          <div className="space-y-2">
            {availableSlots.slice(0, 5).map((slot) => {
              const key = `${slot.startTime}-${slot.endTime}`;
              return (
                <div key={key} className="flex items-center gap-2 text-xs text-slate-600">
                  <Clock className="h-3 w-3" />
                  <span>
                    {new Date(slot.startTime).toLocaleDateString()} {' '}
                    {new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {' '}
                    {new Date(slot.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
            {availableSlots.length > 5 && (
              <p className="text-xs text-slate-500 italic">
                +{availableSlots.length - 5} more slots available
              </p>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-700">
          No available slots in the next 14 days. Check back later or contact the tutor.
        </p>
      </div>
    );
  })();

  const proceedToPayment = () => {
    nav(`/student/checkout?tutorId=${tutor?.id}&tokens=${qty}`, { replace: true });
  };

  const confirmDemoBooking = async () => {
    try {
      setLoading(true);
      await api.post('/bookings/demo', { tutorId });
      setSuccess(true);
    } catch (e: any) {
      showError(e?.response?.data?.message || 'Failed to book demo');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !success) {
    return (
      <div className="container mx-auto px-4 py-10">
        <div className="mb-6 h-10 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-40 w-full animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  if (!tutor) {
    return (
      <div className="container mx-auto px-4 py-10">
        <p className="text-slate-700">Tutor not found. Try selecting a tutor again.</p>
      </div>
    );
  }

  // ✅ Demo Booking UI
  if (isDemo) {
    if (success) {
      return (
        <div className="container mx-auto px-4 py-16 text-center">
          <CheckCircle className="mx-auto mb-4 h-12 w-12 text-emerald-600" />
          <h2 className="text-xl font-semibold mb-2">Booking Confirmed 🎉</h2>
          <p>Your free demo with <b>{tutor.name}</b> has been booked.</p>
          <p className="mt-2 text-sm text-slate-600">
            We’ll notify you once slots are available for this tutor.
          </p>
        </div>
      );
    }

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center gap-2">
          <ShoppingCart className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Confirm Demo Booking</h1>
        </div>

        <div className="rounded-2xl border p-6 shadow-sm max-w-lg mx-auto">
          <div className="flex items-center gap-4">
            <img
              src={
                tutor.avatarUrl ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(tutor.name)}`
              }
              className="h-16 w-16 rounded-full border"
              alt={tutor.name}
            />
            <div>
              <div className="text-lg font-semibold">{tutor.name}</div>
              <div className="text-sm text-slate-600">
                {tutor.subjectPrimary || tutor.subjects?.[0] || 'Subject'}
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-700">
            You’re about to book a <b>free demo session</b> with this tutor. No payment required.
          </p>

          <button
            onClick={confirmDemoBooking}
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 active:scale-[0.99]"
          >
            {loading ? 'Booking…' : 'Confirm Demo Booking'}
          </button>
        </div>
      </div>
    );
  }

  // ✅ Paid Booking UI (default)
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <ShoppingCart className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Your Cart</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tutor summary */}
        <div className="rounded-2xl border p-4 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-4">
            <img
              src={
                tutor.avatarUrl ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(tutor.name)}`
              }
              className="h-16 w-16 rounded-full border"
              alt={tutor.name}
            />
            <div>
              <div className="text-lg font-semibold">{tutor.name}</div>
              <div className="text-sm text-slate-600">
                {(tutor.subjectPrimary || tutor.subjects?.[0] || 'Subject')} ·{' '}
                {formatCurrency(convertFromINR(hourly) ?? hourly, displayCurrency)}/hour
              </div>
            </div>
          </div>

          <div className="mt-6">
            <label htmlFor="cart-tokens" className="mb-1 block text-sm font-medium text-slate-700">
              Tokens (min 5 for booking)
            </label>
            <input
              id="cart-tokens"
              type="number"
              min={5}
              step={1}
              value={qty}
              onChange={onQtyChange}
              className="w-40 rounded-xl border px-3 py-2 text-sm focus:border-ocean-500 focus:outline-none focus:ring-1 focus:ring-ocean-500"
            />
            <p className="mt-2 text-xs text-slate-500">
              You need at least 5 tokens to book a tutor. First session can be a free demo.
            </p>
          </div>

          {/* Tutor Activity Info */}
          {activityInfo && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-ocean-600" />
                <h3 className="text-sm font-semibold text-slate-700">Tutor Activity</h3>
              </div>
              <div className="space-y-2 text-sm">
                {activityInfo.lastActiveDate && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Last active: {new Date(activityInfo.lastActiveDate).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{activityInfo.activityFrequency}</span>
                </div>
              </div>
            </div>
          )}

          {/* Available Slots Preview */}
          {slotsSection}
        </div>

        {/* Summary */}
        <div className="h-fit rounded-2xl border p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Summary</h2>
          
          <hr className="my-3 border-slate-200" />

          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Student</span>
              <span>{displayStudentName}</span>
            </div>
            <div className="flex justify-between">
              <span>Tokens</span>
              <span>{qty}</span>
            </div>
            <div className="flex justify-between">
              <span>Estimated total</span>
              <span>{formatCurrency(Math.round(subtotalDisplay), displayCurrency)}</span>
            </div>
          </div>

          <div className="mt-1 text-right text-xs text-slate-500">
            Amount excludes GST/taxes.
          </div>

          <button
            onClick={proceedToPayment}
            className="mt-4 w-full rounded-xl bg-ocean-700 py-3 font-medium text-white hover:bg-ocean-800 active:scale-[0.99]"
          >
            <div className="flex items-center justify-center gap-2">
              <CreditCard className="h-5 w-5" />
              Proceed to Payment
            </div>
          </button>

          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4" /> Secure payment · Refundable as per policy
          </div>
        </div>
      </div>
    </div>
  );
}
