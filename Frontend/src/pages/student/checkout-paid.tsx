// src/pages/student/checkout-paid.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createOrder, verifyPayment } from '../../services/paymentsService';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/apiClient';

declare global {
  interface Window {
    Razorpay?: any;
  }
  var Razorpay: any;
}

async function loadRazorpayScript(): Promise<void> {
  if (globalThis.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Razorpay.'));
    document.body.appendChild(s);
  });
}

export default function StudentCheckoutPaid() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth() as any;
  const tutorId = sp.get('tutorId') || '';
  const tokens = Number(sp.get('tokens') || '0');
  const packId = sp.get('packId') || undefined;
  const couponCode = sp.get('couponCode') || undefined;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // canProceed: either packId or tokens must be present
  const canProceed = useMemo(
    () => Boolean(tutorId) && (Boolean(packId) || (Number.isFinite(tokens) && tokens > 0)),
    [tutorId, tokens, packId],
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!canProceed) {
        setErr('Missing tutorId or tokens.');
        return;
      }

      try {
        setBusy(true);
        setErr(null);

        // Check profile completion and approval before allowing purchase
        try {
          const { data: profileStatus } = await api.get('/students/me/profile-status');
          if (!profileStatus?.isComplete) {
            setErr(`Please complete your profile first. Missing: ${(profileStatus?.missingFields || []).join(', ')}`);
            setTimeout(() => navigate('/student/profile'), 3000);
            return;
          }
          if (profileStatus?.profileStatus !== 'APPROVED') {
            setErr(profileStatus?.profileStatus === 'PENDING'
              ? 'Your profile is pending admin approval. You can make purchases once approved.'
              : 'Your profile needs updates. Please check your profile page.');
            setTimeout(() => navigate('/student/profile'), 3000);
            return;
          }
        } catch {
          // If profile status check fails, allow purchase to proceed
        }

        // Get user's preferred display currency from user profile
        const displayCurrency = user?.preferredCurrency || 'INR';

        // 1) Ask backend for order (backend always uses INR for Razorpay)
        const order = await createOrder({
          tutorId,
          ...(packId ? { packId, ...(couponCode && { couponCode }) } : { tokens }),
          displayCurrency,
        });

        // 2) Ensure Razorpay is available
        await loadRazorpayScript();

        const key = order.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID;
        if (!key) throw new Error('Missing Razorpay key (VITE_RAZORPAY_KEY_ID).');

        // 3) Open Razorpay checkout
        const options = {
          key,
          order_id: order.orderId,
          amount: order.amount,          // in paise
          currency: order.currency || 'INR',
          name: 'Tunect',
          description: 'Token purchase',
          notes: { tutorId, tokens: String(tokens), paymentId: order.paymentId },
          theme: { color: '#047857' },

          handler: async (response: any) => {
            try {
              const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = response;
              const verification = await verifyPayment({
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature,
              });
              if (verification?.ok) {
                navigate(`/student/payment/success?orderId=${order.orderId}&tutorId=${tutorId}`, { replace: true });
              } else {
                navigate(`/student/payment/failure?orderId=${order.orderId}`, { replace: true });
              }
            } catch (e) {
              console.error('Payment verification failed:', e);
              navigate(`/student/payment/failure?orderId=${order.orderId}`, { replace: true });
            }
          },

          modal: {
            ondismiss: () => {
              const params = new URLSearchParams({ tutorId });
              if (packId) params.set('packId', packId);
              else params.set('tokens', String(tokens));
              navigate(`/student/cart?${params.toString()}`, { replace: true });
            },
          },
        };

        if (!mounted) return;

        const rzp = new globalThis.Razorpay(options);
        rzp.open();
      } catch (e: any) {
        if (mounted) setErr(e?.message || 'Could not start checkout.');
      } finally {
        if (mounted) setBusy(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [canProceed, tutorId, tokens, packId, couponCode, navigate]);

  return (
    <main className="container mx-auto px-4 py-12" data-testid="student-checkout-paid-page">
      <h1 className="text-2xl font-semibold mb-2">Redirecting to payment…</h1>
      <p className="text-slate-600">Please wait while we open Razorpay.</p>
      {busy && <div className="mt-4 h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />}
      {err && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="student-checkout-paid-error-alert">
          {err}
        </div>
      )}
    </main>
  );
}
