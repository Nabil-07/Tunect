import { useState } from "react";
import { useNavigate } from "react-router-dom";
import NotificationModal from "./common/NotificationModal";

type Props = {
  readonly tutorId: string;
  readonly defaultTokens?: number;
  readonly onSuccess?: (paymentId: string) => void;
};

export default function BuyTokensButton({ tutorId, defaultTokens = 5, onSuccess }: Props) {
  const navigate = useNavigate();
  const [tokens, setTokens] = useState<number>(defaultTokens);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handlePay() {
    try {
      setLoading(true);
      navigate(`/student/cart?tutorId=${tutorId}&tokens=${tokens}`);
      onSuccess?.("cart");
    } catch (e: any) {
      setErrorMessage(e?.response?.data?.message || e?.message || "Unable to start payment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2" data-testid="buy-tokens">
        <input
          type="number"
          min={5}
          step={1}
          value={tokens}
          onChange={(e) => setTokens(Math.max(5, Number(e.target.value) || 5))}
          className="w-24 border rounded px-2 py-1"
          data-testid="buy-tokens-amount-input"
        />
        <button
          onClick={handlePay}
          disabled={loading}
          className="rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-60"
          data-testid="buy-tokens-btn"
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
