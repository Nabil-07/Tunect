import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/apiClient';
import { createDemoBooking } from '../../services/bookingsService';

export default function CheckoutPage() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const tutorId = sp.get('tutorId') || '';
  const [confirming, setConfirming] = useState(false);
  const [booked, setBooked] = useState(false); // Track if already booked
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (!tutorId) {
      navigate('/find-tutors', { replace: true });
    }
  }, [tutorId, navigate]);

  async function afterConfirm() {
    navigate('/student/bookings', { replace: true, state: { toast: 'Demo booked! You\'ll be able to join once a slot is confirmed.' } });
  }

  async function confirmDemo() {
    if (!tutorId || booked) return; // Prevent if already booked
    try {
      setConfirming(true);

      // Check profile completion and approval before allowing booking
      try {
        const { data: profileStatus } = await api.get('/students/me/profile-status');
        if (!profileStatus?.isComplete) {
          setErrorModal({
            title: 'Complete Your Profile',
            message: `Please complete your profile first to continue learning.\n\nMissing: ${(profileStatus?.missingFields || []).join(', ')}\n\nYour profile is ${profileStatus?.completionPercentage ?? 0}% complete.`,
          });
          setTimeout(() => navigate('/student/profile'), 3000);
          return;
        }
        if (profileStatus?.profileStatus !== 'APPROVED') {
          setErrorModal({
            title: 'Profile Not Approved',
            message: profileStatus?.profileStatus === 'PENDING'
              ? 'Your profile is pending admin approval. You can book sessions once approved.'
              : 'Your profile needs updates. Please check your profile page.',
          });
          setTimeout(() => navigate('/student/profile'), 3000);
          return;
        }
      } catch {
        // If profile status check fails, allow booking to proceed
      }

      await createDemoBooking({ tutorId });
      setBooked(true); // Mark as booked to prevent duplicate clicks
      
      // Refresh demo status after successful booking
      window.dispatchEvent(new CustomEvent('demo-status-changed', { 
        detail: { tutorId } 
      }));
      
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
        
        // Refresh demo status even on conflict (to update UI)
        window.dispatchEvent(new CustomEvent('demo-status-changed', { 
          detail: { tutorId } 
        }));
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
    <main className="container mx-auto max-w-2xl px-4 py-8" data-testid="student-checkout-page">
      <h1 className="text-2xl font-bold mb-2">Free Demo Checkout</h1>
      <p className="text-sm text-slate-600 mb-6">You're booking a free demo with this tutor. No payment required.</p>

      <div className="rounded-xl border bg-white p-4 shadow-sm" data-testid="student-checkout-order-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Free Demo</div>
            <div className="text-xs text-slate-500">0.00 INR</div>
          </div>
          <button 
            onClick={confirmDemo} 
            disabled={confirming || booked} 
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60 disabled:cursor-not-allowed"
            data-testid="student-checkout-confirm-btn"
          >
            {confirming ? 'Confirming...' : booked ? 'Booked' : 'Confirm Booking'}
          </button>
        </div>
      </div>

      {/* Error Modal */}
      {errorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="student-checkout-error-modal">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">{errorModal.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{errorModal.message}</p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setErrorModal(null)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                data-testid="student-checkout-error-close-btn"
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
