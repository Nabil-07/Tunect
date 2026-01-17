import { useEffect, useState } from 'react';
import api from '../../lib/apiClient';

type Wallet = { tutorId: string; balance: number; updatedAt: string };
type LedgerItem = { id: string; bookingId?: string; delta: string; reason: string; note?: string; createdAt: string; booking?: { id: string; startTime: string; endTime: string } };
type Payout = { id: string; amount: string; status: string; reference?: string; createdAt: string; paidAt?: string };

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
    const candidates = [1, 7, 14, 21].filter((d) => d >= day);
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
                  <li key={p.id} className="py-2 flex items-center justify-between">
                    <div className="text-sm">
                      <div className="font-medium">{p.status}</div>
                      <div className="text-slate-600 text-xs">{new Date(p.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="text-sm font-semibold">{formatCurrency(Number(p.amount))}</div>
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
