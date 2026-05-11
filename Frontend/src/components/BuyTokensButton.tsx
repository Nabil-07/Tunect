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
  const [tokenInput, setTokenInput] = useState(String(defaultTokens));
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedTokens = (() => {
    if (tokenInput === "") return defaultTokens;
    const n = parseInt(tokenInput, 10);
    return Number.isFinite(n) && n >= 5 ? n : defaultTokens;
  })();

  async function handlePay() {
    try {
      setLoading(true);
      const q = new URLSearchParams({ tutorId });
      if (resolvedTokens >= 5) q.set("tokens", String(resolvedTokens));
      navigate(`/student/cart?${q.toString()}`);
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
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="5"
          value={tokenInput}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              setTokenInput("");
              return;
            }
            if (!/^\d+$/.test(v)) return;
            setTokenInput(v);
          }}
          onBlur={() => {
            if (tokenInput === "") {
              setTokenInput(String(defaultTokens));
              return;
            }
            const n = parseInt(tokenInput, 10);
            if (!Number.isFinite(n) || n < 5) setTokenInput(String(defaultTokens));
          }}
          className="w-24 border rounded px-2 py-1"
          data-testid="buy-tokens-amount-input"
        />
        <button
          onClick={handlePay}
          disabled={loading}
          className="rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-60"
          data-testid="buy-tokens-btn"
        >
          {loading ? "Processing..." : "Buy tokens"}
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
