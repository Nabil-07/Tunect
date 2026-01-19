import { useState } from "react";
import { createOrder, verifyPayment } from "../services/paymentsService";
import { ensureRazorpayLoaded, openRazorpay } from "../utils/razorpay";
import NotificationModal from "./common/NotificationModal";

type Props = {
  tutorId: string;
  defaultTokens?: number;
  onSuccess?: (paymentId: string) => void;
};

export default function BuyTokensButton({ tutorId, defaultTokens = 5, onSuccess }: Props) {
  const [tokens, setTokens] = useState<number>(defaultTokens);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handlePay() {
    try {
      setLoading(true);
      await ensureRazorpayLoaded();

      // 1) Create order on backend (amount is computed server-side from tutor.hourlyRate * tokens)
      const order = await createOrder({ tutorId, tokens });

      // 2) Open Razorpay Checkout
      const options: any = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || order.keyId,
        amount: order.amount,         // paise
        currency: order.currency,     // "INR"
        name: "Tunect",
        description: `${tokens} tokens`,
        order_id: order.orderId,
        theme: { color: "#2563eb" },
        handler: async (response: any) => {
          try {
            // 3) Verify signature with backend (this credits tokens)
            const verify = await verifyPayment(response);
            if (verify.ok) {
              onSuccess?.(verify.paymentId);
              setErrorMessage(null);
            } else {
              setErrorMessage("Payment verification failed.");
            }
          } catch (e: any) {
            setErrorMessage(e?.message || "Verification failed");
          }
        },
        modal: {
          ondismiss: () => {
            // optional: track dismiss
          },
        },
        prefill: {
          // optional: fill from your user profile
          name: "",
          email: "",
          contact: "",
        },
      };

      openRazorpay(options);
    } catch (e: any) {
      setErrorMessage(e?.response?.data?.message || e?.message || "Unable to start payment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={5}
          step={1}
          value={tokens}
          onChange={(e) => setTokens(Math.max(5, Number(e.target.value) || 5))}
          className="w-24 border rounded px-2 py-1"
        />
        <button
          onClick={handlePay}
          disabled={loading}
          className="rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-60"
        >
          {loading ? "Processing..." : `Buy ${tokens} tokens`}
        </button>
      </div>

      <NotificationModal
        open={!!errorMessage}
        onClose={() => setErrorMessage(null)}
        title="Payment Error"
        message={errorMessage || "Unable to start payment."}
        type="error"
        confirmText="Close"
      />
    </>
  );
}
