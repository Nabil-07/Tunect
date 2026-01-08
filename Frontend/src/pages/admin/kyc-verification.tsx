// src/pages/admin/kyc-verification.tsx
import { useEffect, useState } from 'react';
import { approveKyc, fetchKycQueue, rejectKyc, type KycItem } from '../../services/adminService';

export default function AdminKYCVerification() {
  const [items, setItems] = useState<KycItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchKycQueue({ status: 'PENDING', pageSize: 200 });
        setItems(data.items);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load KYC queue');
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handle = async (id: string, action: 'approve' | 'reject') => {
    try {
      if (action === 'approve') await approveKyc(id);
      else await rejectKyc(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update KYC');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">KYC Verification</h2>
        <p className="text-slate-600 text-sm">Approve valid degree proof and payment info; keep tutor on Hold until approved.</p>
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}

      {loading ? (
        <div className="text-slate-600">Loading KYC queue...</div>
      ) : items.length === 0 ? (
        <div className="text-slate-600">No pending KYC submissions.</div>
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.id} className="border border-slate-200 rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-slate-900">{i.tutor.user.email}</div>
                  <div className="text-xs text-slate-500">Doc type: {i.docType}</div>
                  <div className="text-xs text-slate-500 mt-1">Submitted: {new Date(i.createdAt).toLocaleString()}</div>
                  <div className="text-sm text-slate-700 mt-2">Document: {i.url ? <a className="text-indigo-600" href={i.url} target="_blank" rel="noreferrer">View</a> : 'N/A'}</div>
                  {i.notes && <div className="text-sm text-slate-700">Notes: {i.notes}</div>}
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm"
                    onClick={() => handle(i.id, 'approve')}
                  >
                    Approve
                  </button>
                  <button
                    className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm"
                    onClick={() => handle(i.id, 'reject')}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
