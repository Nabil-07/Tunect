import { http as api } from '../api/http';

/** Response from POST /payments/order */
export type CreateOrderResponse = {
  orderId: string;   // Razorpay order id
  amount: number;    // paise
  currency: "INR";
  keyId: string;     // your public key (for checkout UI)
  paymentId: string; // your internal payment record id
};

export async function createOrder(payload: {
  tutorId: string;
  tokens: number;
  notes?: string;
  displayCurrency?: string;
}) {
  const { data } = await api.post<CreateOrderResponse>("/payments/order", payload);
  return data;
}

export type VerifyPaymentPayload = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export async function verifyPayment(payload: VerifyPaymentPayload) {
  const { data } = await api.post<{ ok: boolean; paymentId: string }>("/payments/verify", payload);
  return data;
}

export async function downloadReceipt(paymentId: string) {
  try {
    const res = await api.get(`/payments/${paymentId}/receipt`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `receipt-${paymentId}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    console.error("Failed to download receipt", err);
  }
}
