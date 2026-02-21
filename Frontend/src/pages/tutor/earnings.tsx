import { useEffect, useState } from 'react';
import api from '../../lib/apiClient';

type Wallet = { tutorId: string; balance: number; updatedAt: string };
type LedgerItem = { id: string; bookingId?: string; delta: string; reason: string; note?: string; createdAt: string; booking?: { id: string; startTime: string; endTime: string } };
type Payout = { id: string; amount: string; status: string; reference?: string; transactionId?: string; paymentMethod?: string; createdAt: string; paidAt?: string };
type Receipt = { receiptId: string; tutorName: string; tutorEmail: string; amount: number; status: string; transactionId?: string; paymentMethod?: string; reference?: string; createdAt: string; paidAt?: string; companyName: string; generatedAt: string };

export default function TutorEarnings() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [loadingPayouts, setLoadingPayouts] = useState(true);

  const formatCurrency = (value: number) => `₹ ${value.toFixed(2)}`;
  const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : '—');

  const nextPayoutDate = (() => {
    const today = new Date();
    const day = today.getDate();
    const candidates = [1, 7, 14, 21].filter((d) => d > day);
    const nextDay = candidates[0];
    const target = new Date(today);
    if (nextDay) {
      target.setDate(nextDay);
    } else {
      target.setMonth(target.getMonth() + 1);
      target.setDate(1);
    }
    target.setHours(9, 0, 0, 0);
    return target;
  })();

  const totalPayout = payouts.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const unpaidAmount = Number(wallet?.balance || 0);
  const totalEarnings = totalPayout + unpaidAmount;
  const recentTransfer = payouts
    .slice()
    .sort((a, b) => new Date(b.paidAt || b.createdAt).getTime() - new Date(a.paidAt || a.createdAt).getTime())[0];

  useEffect(() => {
    // ✅ Load wallet independently
    api.get('/tutors/me/wallet')
      .then(r => setWallet(r.data))
      .catch(e => console.error('Failed to load wallet:', e))
      .finally(() => setLoadingWallet(false));
    
    // ✅ Load ledger independently
    api.get('/tutors/me/ledger?limit=20')
      .then(r => setLedger(r.data?.items ?? []))
      .catch(e => console.error('Failed to load ledger:', e))
      .finally(() => setLoadingLedger(false));
    
    // ✅ Load payouts independently
    api.get('/tutors/me/payouts?limit=20')
      .then(r => setPayouts(r.data?.items ?? []))
      .catch(e => console.error('Failed to load payouts:', e))
      .finally(() => setLoadingPayouts(false));
  }, []);

  const downloadReceipt = async (payoutId: string) => {
    try {
      const res = await api.get<Receipt>(`/tutors/me/payouts/${payoutId}/receipt`);
      const r = res.data;
      // Generate a downloadable HTML receipt
      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Payout Receipt ${r.receiptId}</title>
<style>
body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:20px;color:#333}
.header{text-align:center;border-bottom:2px solid #4f46e5;padding-bottom:16px;margin-bottom:24px}
.header h1{color:#4f46e5;margin:0;font-size:24px}
.header p{color:#666;margin:4px 0 0}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb}
.label{color:#6b7280;font-size:14px}
.value{font-weight:600;font-size:14px}
.amount{font-size:24px;color:#059669;font-weight:700;text-align:center;padding:20px 0}
.footer{text-align:center;margin-top:24px;color:#9ca3af;font-size:12px}
</style></head><body>
<div class="header"><h1>${r.companyName}</h1><p>Payout Receipt</p></div>
<div class="amount">₹ ${r.amount.toFixed(2)}</div>
<div class="row"><span class="label">Receipt ID</span><span class="value">${r.receiptId}</span></div>
<div class="row"><span class="label">Tutor</span><span class="value">${r.tutorName}</span></div>
<div class="row"><span class="label">Email</span><span class="value">${r.tutorEmail}</span></div>
<div class="row"><span class="label">Status</span><span class="value">${r.status}</span></div>
${r.transactionId ? `<div class="row"><span class="label">Transaction ID</span><span class="value">${r.transactionId}</span></div>` : ''}
${r.paymentMethod ? `<div class="row"><span class="label">Payment Method</span><span class="value" style="text-transform:capitalize">${r.paymentMethod.replace('_', ' ')}</span></div>` : ''}
${r.reference ? `<div class="row"><span class="label">Reference</span><span class="value">${r.reference}</span></div>` : ''}
<div class="row"><span class="label">Created</span><span class="value">${new Date(r.createdAt).toLocaleString()}</span></div>
${r.paidAt ? `<div class="row"><span class="label">Paid On</span><span class="value">${new Date(r.paidAt).toLocaleString()}</span></div>` : ''}
<div class="footer"><p>Generated on ${new Date(r.generatedAt).toLocaleString()}</p><p>${r.companyName} — This is a system-generated receipt</p></div>
</body></html>`;
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${r.receiptId}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to download receipt:', e);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold">Earnings</h2>
        <p className="text-slate-600 text-sm sm:text-base">Your wallet balance, recent earnings and payouts.</p>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border bg-white shadow-sm p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total earnings</div>
          <div className="text-xl font-bold mt-2">
            {loadingWallet || loadingPayouts ? '—' : formatCurrency(totalEarnings)}
          </div>
        </div>
        <div className="rounded-2xl border bg-white shadow-sm p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Unpaid amount</div>
          <div className="text-xl font-bold mt-2">
            {loadingWallet ? '—' : formatCurrency(unpaidAmount)}
          </div>
        </div>
        <div className="rounded-2xl border bg-white shadow-sm p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Next payout date</div>
          <div className="text-base font-semibold mt-2">
            {nextPayoutDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          </div>
        </div>
        <div className="rounded-2xl border bg-white shadow-sm p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total payout</div>
          <div className="text-xl font-bold mt-2">
            {loadingPayouts ? '—' : formatCurrency(totalPayout)}
          </div>
        </div>
        <div className="rounded-2xl border bg-white shadow-sm p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Recent transfer</div>
          <div className="text-sm font-semibold mt-2">
            {loadingPayouts || !recentTransfer ? '—' : formatCurrency(Number(recentTransfer.amount))}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {loadingPayouts || !recentTransfer ? '' : formatDate(recentTransfer.paidAt || recentTransfer.createdAt)}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white shadow-sm p-4">
        <div className="text-sm text-slate-600">Wallet balance</div>
        {loadingWallet ? (
          <div className="h-12 mt-1 rounded animate-pulse bg-slate-100" />
        ) : (
          <>
            <div className="text-3xl font-bold mt-1">{wallet ? formatCurrency(Number(wallet.balance)) : '—'}</div>
            <div className="text-xs text-slate-500 mt-1">Updated {wallet ? new Date(wallet.updatedAt).toLocaleString() : ''}</div>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3 font-semibold">Recent earnings</div>
          <div className="p-4">
            {loadingLedger ? (
              <div className="h-32 rounded animate-pulse bg-slate-50" />
            ) : ledger.length === 0 ? (
              <div className="text-sm text-slate-500">No entries yet.</div>
            ) : (
              <ul className="divide-y">
                {ledger.map((e) => (
                  <li key={e.id} className="py-2 flex items-center justify-between">
                    <div className="text-sm">
                      <div className="font-medium">{e.reason}</div>
                      <div className="text-slate-600 text-xs">{new Date(e.createdAt).toLocaleString()}</div>
                    </div>
                    <div className={`text-sm font-semibold ${Number(e.delta) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{Number(e.delta) >= 0 ? '+' : ''}{Number(e.delta).toFixed(2)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3 font-semibold">Payouts</div>
          <div className="p-4">
            {loadingPayouts ? (
              <div className="h-32 rounded animate-pulse bg-slate-50" />
            ) : payouts.length === 0 ? (
              <div className="text-sm text-slate-500">No payouts yet.</div>
            ) : (
              <ul className="divide-y">
                {payouts.map((p) => (
                  <li key={p.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="text-sm flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          p.status === 'PAID' ? 'bg-green-100 text-green-700' :
                          p.status === 'CANCELED' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>{p.status}</span>
                        {p.paymentMethod && (
                          <span className="text-xs text-slate-500 capitalize">{p.paymentMethod.replace('_', ' ')}</span>
                        )}
                      </div>
                      <div className="text-slate-600 text-xs mt-1">
                        {p.paidAt ? `Paid ${new Date(p.paidAt).toLocaleDateString()}` : new Date(p.createdAt).toLocaleString()}
                      </div>
                      {p.transactionId && (
                        <div className="text-xs text-slate-400 font-mono mt-0.5">TxnID: {p.transactionId}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{formatCurrency(Number(p.amount))}</div>
                      {p.status === 'PAID' && (
                        <button
                          onClick={() => downloadReceipt(p.id)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1 inline-flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          Receipt
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
