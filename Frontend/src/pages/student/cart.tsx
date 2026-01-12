// src/pages/student/cart.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingCart, CreditCard, ShieldCheck, CheckCircle } from 'lucide-react';
import { getTutorById } from '../../services/tutorService';
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

  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [qty, setQty] = useState<number>(10); // tokens count
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);

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
      } finally {
        setLoading(false);
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
    const n = parseInt(e.target.value || '10', 10);
    if (Number.isNaN(n)) return;
    setQty(Math.max(10, n));
  };

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
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Tokens (min 10 for booking)
            </label>
            <input
              type="number"
              min={10}
              step={1}
              value={qty}
              onChange={onQtyChange}
              className="w-40 rounded-xl border px-3 py-2 text-sm focus:border-ocean-500 focus:outline-none focus:ring-1 focus:ring-ocean-500"
            />
            <p className="mt-2 text-xs text-slate-500">
              You need at least 5 tokens to book a tutor. First session can be a free demo.
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="h-fit rounded-2xl border p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Summary</h2>
          
          <hr className="my-3 border-slate-200" />

          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Student</span>
              <span>{user?.email}</span>
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
