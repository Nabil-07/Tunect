//src/utils/razorpay.ts
// Lightweight helpers to load Razorpay checkout and open the modal

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export async function ensureRazorpayLoaded(): Promise<void> {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
    document.body.appendChild(script);
  });
}

export function openRazorpay(options: any) {
  if (!window.Razorpay) throw new Error('Razorpay SDK not loaded');
  const rzp = new window.Razorpay(options);
  rzp.open();
  return rzp;
}
