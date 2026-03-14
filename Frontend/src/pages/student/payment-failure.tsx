// src/pages/student/payment-success.tsx
import { CheckCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

export default function PaymentSuccess() {
  const [sp] = useSearchParams();
  const orderId = sp.get('orderId') || '';

  return (
    <main className="container mx-auto px-4 py-16 text-center" data-testid="student-payment-failure-page">
      <CheckCircle className="mx-auto mb-4 h-12 w-12 text-emerald-600" />
      <h1 className="text-2xl font-semibold">Payment successful</h1>
      {orderId && <p className="mt-2 text-sm text-slate-600">Order: {orderId}</p>}
      <p className="mt-4 text-slate-700">
        Tokens will reflect in your balance shortly. You can now book a session.
      </p>
      <div className="mt-6">
        <Link to="/student/bookings" className="rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700" data-testid="student-payment-failure-bookings-link">
          Go to Bookings
        </Link>
      </div>
    </main>
  );
}
