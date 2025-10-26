import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const orderId = params.get("orderId") || params.get("order_id") || "—";

  // if the student came here after a booking purchase without slot,
  // prepare to prompt slot selection on the bookings page
  function goPickSlot() {
    localStorage.setItem("PROMPT_SELECT_SLOT", "1");
    nav("/student/bookings?promptSelect=1");
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-3xl border bg-white p-10 shadow-sm text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold">Payment successful</h1>
        <p className="mt-1 text-slate-600 text-sm">
          Order: <span className="font-mono">{orderId}</span>
        </p>
        <p className="mt-4 text-slate-700">
          Tokens will reflect in your balance shortly. If your purchase included a session
          without a selected time, you can choose a slot now.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => nav("/student/bookings")}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-700"
          >
            Go to Bookings
          </button>
          <button
            onClick={goPickSlot}
            className="rounded-xl border border-ocean-600 px-5 py-2.5 font-medium text-ocean-700 hover:bg-ocean-50"
          >
            Pick a Slot Now
          </button>
        </div>
      </div>
    </div>
  );
}
