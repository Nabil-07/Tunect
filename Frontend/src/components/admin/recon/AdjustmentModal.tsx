// src/components/admin/recon/AdjustmentModal.tsx
import { useState } from 'react';

export default function AdjustmentModal({
  date,
  defaultRef,
  onClose,
  onSubmit,
}: {
  date: string;
  defaultRef?: string;
  onClose: () => void;
  onSubmit: (payload: { date: string; ref?: string; reason: string; amount: number; side: 'BANK' | 'GATEWAY' }) => Promise<void>;
}) {
  const [ref, setRef] = useState(defaultRef ?? '');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [side, setSide] = useState<'BANK' | 'GATEWAY'>('BANK');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({ date, ref: ref || undefined, reason, amount: Number(amount), side });
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Failed to create adjustment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg border shadow-lg">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="font-semibold">New Adjustment</div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div className="text-sm text-slate-600">Date: <span className="font-medium">{date}</span></div>

          <div>
            <label className="block text-sm mb-1">Reference (optional)</label>
            <input
              className="w-full h-10 px-3 rounded-lg border"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="Txn ref to attach (optional)"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Reason</label>
            <input
              className="w-full h-10 px-3 rounded-lg border"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Bank charges, TDS, gateway fee variance"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                className="w-full h-10 px-3 rounded-lg border text-right"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Apply To</label>
              <select
                className="w-full h-10 px-3 rounded-lg border"
                value={side}
                onChange={(e) => setSide(e.target.value as any)}
              >
                <option value="BANK">Bank</option>
                <option value="GATEWAY">Gateway</option>
              </select>
            </div>
          </div>

          {err && <div className="text-sm text-rose-600">{err}</div>}

          <div className="pt-3 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="h-10 px-3 rounded-lg border">Cancel</button>
            <button
              type="submit"
              disabled={busy}
              className="h-10 px-3 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Create Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
