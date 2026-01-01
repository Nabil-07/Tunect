import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/apiClient';
import { createDemoBooking } from '../../services/bookingsService';

type BookableSlot = { startTime: string; endTime: string };

export default function CheckoutPage() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const tutorId = sp.get('tutorId') || '';
  const [confirming, setConfirming] = useState(false);
  const [booked, setBooked] = useState(false); // Track if already booked
  const [msg, setMsg] = useState<string>('');
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (!tutorId) {
      navigate('/find-tutors', { replace: true });
    }
  }, [tutorId, navigate]);

  async function afterConfirm() {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    let slots: BookableSlot[] = [];
    try {
      const { data } = await api.get(`/availability/tutor/${tutorId}/bookable`, { params: { from, to } });
      const arr = Array.isArray(data?.slices) ? data.slices : Array.isArray(data) ? data : [];
      slots = arr as any;
    } catch {
      try {
        const { data } = await api.get(`/availability/bookable/${tutorId}`, { params: { from, to } });
        slots = Array.isArray(data) ? data : [];
      } catch { /* ignore */ }
    }

    if (slots.length > 0) {
      navigate(`/tutor/${tutorId}?demo=1#slots`, { replace: true, state: { toast: 'Demo booked! Pick any available slot.' } });
    } else {
      setMsg("Booking successfully booked. The tutor has been notified to add slots. You'll get a notification when slots are available.");
    }
  }

  async function confirmDemo() {
    if (!tutorId || booked) return; // Prevent if already booked
    try {
      setConfirming(true);
      await createDemoBooking({ tutorId });
      setBooked(true); // Mark as booked to prevent duplicate clicks
      // Don't set message here - let afterConfirm handle it
      await afterConfirm();
    } catch (e: any) {
      const status = e?.response?.status;
      const message = e?.response?.data?.message || e?.message || 'Could not create demo booking.';
      
      if (status === 409) {
        setErrorModal({
          title: 'Demo Already Used',
          message: message || 'You have already used your free demo with this tutor.'
        });
        setBooked(true); // Prevent further attempts
      } else if (status === 401) {
        navigate('/login');
      } else if (status === 400 && message.includes('Student profile not found')) {
        setErrorModal({
          title: 'Profile Not Complete',
          message: 'Please complete your student profile setup before booking a demo.'
        });
        setTimeout(() => navigate('/choose-role'), 2000);
      } else {
        setErrorModal({
          title: 'Booking Failed',
          message: message
        });
      }
    } finally {
      setConfirming(false);
    }
  }

  return (
    <main className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Free Demo Checkout</h1>
      <p className="text-sm text-slate-600 mb-6">You're booking a free demo with this tutor. No payment required.</p>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Free Demo</div>
            <div className="text-xs text-slate-500">0.00 INR</div>
          </div>
          <button 
            onClick={confirmDemo} 
            disabled={confirming || booked} 
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {confirming ? 'Confirming...' : booked ? 'Booked' : 'Confirm Booking'}
          </button>
        </div>
        {msg && <div className="mt-4 rounded bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      </div>

      <div className="mt-6 text-sm text-slate-600">
        After confirming, you'll select a slot on the tutor's page. If no slots are currently available, the tutor will be notified to add availability and you'll be alerted when it's ready.
      </div>

      {/* Error Modal */}
      {errorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">{errorModal.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{errorModal.message}</p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setErrorModal(null)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
