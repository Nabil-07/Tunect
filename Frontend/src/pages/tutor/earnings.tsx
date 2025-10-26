import { useEffect, useMemo, useState } from 'react';
import api from '../../lib/apiClient';

type Wallet = { tutorId: string; balance: number; updatedAt: string };
type LedgerItem = { id: string; bookingId?: string; delta: string; reason: string; note?: string; createdAt: string; booking?: { id: string; startTime: string; endTime: string } };
type Payout = { id: string; amount: string; status: string; reference?: string; createdAt: string; paidAt?: string };

export default function TutorEarnings() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [w, l, p] = await Promise.all([
          api.get('/tutors/me/wallet').then(r => r.data),
          api.get('/tutors/me/ledger?limit=20').then(r => r.data?.items ?? []),
          api.get('/tutors/me/payouts?limit=20').then(r => r.data?.items ?? []),
        ]);
        if (!mounted) return;
        setWallet(w);
        setLedger(l);
        setPayouts(p);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold">Earnings</h2>
        <p className="text-slate-600 text-sm sm:text-base">Your wallet balance, recent earnings and payouts.</p>
      </div>

      <section className="rounded-2xl border bg-white shadow-sm p-4">
        <div className="text-sm text-slate-600">Wallet balance</div>
        <div className="text-3xl font-bold mt-1">{wallet ? `₹ ${Number(wallet.balance).toFixed(2)}` : '—'}</div>
        <div className="text-xs text-slate-500 mt-1">Updated {wallet ? new Date(wallet.updatedAt).toLocaleString() : ''}</div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3 font-semibold">Recent earnings</div>
          <div className="p-4">
            {loading ? (
              <div className="text-sm text-slate-500">Loading…</div>
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
            {loading ? (
              <div className="text-sm text-slate-500">Loading…</div>
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
                    <div className="text-sm font-semibold">₹ {Number(p.amount).toFixed(2)}</div>
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
