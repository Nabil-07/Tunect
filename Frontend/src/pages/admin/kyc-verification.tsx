// src/pages/admin/kyc-verification.tsx
import { useEffect, useMemo, useState } from 'react';
import { fetchKycQueue, fetchKycBundle, reviewKyc, type KycItem, type KycBundle } from '../../services/adminService';

export default function AdminKYCVerification() {
  const [items, setItems] = useState<KycItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTutorId, setExpandedTutorId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, { loading: boolean; data?: KycBundle; error?: string }>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

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

  const grouped = useMemo(() => {
    const map = new Map<string, { tutorId: string; email: string; docs: KycItem[] }>();
    items.forEach((doc) => {
      const id = doc.tutor.id;
      if (!map.has(id)) map.set(id, { tutorId: id, email: doc.tutor.user.email, docs: [] });
      map.get(id)!.docs.push(doc);
    });
    return Array.from(map.values());
  }, [items]);

  const loadDetails = async (tutorId: string) => {
    setDetails((prev) => ({ ...prev, [tutorId]: { loading: true } }));
    try {
      const data = await fetchKycBundle(tutorId);
      setDetails((prev) => ({ ...prev, [tutorId]: { loading: false, data } }));
    } catch (err: any) {
      setDetails((prev) => ({ ...prev, [tutorId]: { loading: false, error: err?.response?.data?.message || 'Failed to load details' } }));
    }
  };

  const toggleTutor = (tutorId: string) => {
    setExpandedTutorId((prev) => (prev === tutorId ? null : tutorId));
    if (!details[tutorId]) {
      loadDetails(tutorId);
    }
  };

  const handleReview = async (docId: string, tutorId: string, status: 'PENDING' | 'APPROVED' | 'REJECTED') => {
    const note = notes[tutorId];
    try {
      const updated = await reviewKyc(docId, status, note);

      // update flat list
      setItems((prev) => {
        const next = prev
          .map((d) => (d.id === docId ? { ...d, status: updated.status, notes: updated.notes } : d))
          .filter((d) => (status === 'PENDING' ? true : d.id !== docId));
        return next;
      });

      // update details cache
      setDetails((prev) => {
        const entry = prev[tutorId];
        if (!entry?.data) return prev;
        return {
          ...prev,
          [tutorId]: {
            ...entry,
            data: {
              ...entry.data,
              documents: entry.data.documents
                .map((d) => (d.id === docId ? { ...d, status: updated.status, notes: updated.notes } : d))
                .filter((d) => (status === 'PENDING' ? true : d.id !== docId)),
            },
          },
        };
      });

      // If all docs resolved, collapse card
      setExpandedTutorId((prev) => {
        const remainingDocs = (details[tutorId]?.data?.documents || []).filter((d) => d.id !== docId);
        if (status !== 'PENDING' && remainingDocs.length <= 1) return null;
        return prev;
      });
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
      ) : grouped.length === 0 ? (
        <div className="text-slate-600">No pending KYC submissions.</div>
      ) : (
        <div className="space-y-3">
          {grouped.map((group) => {
            const isOpen = expandedTutorId === group.tutorId;
            const detail = details[group.tutorId];
            const docCount = group.docs.length;
            return (
              <div key={group.tutorId} className="border border-slate-200 rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-900">{group.email}</div>
                    <div className="text-xs text-slate-500">Pending documents: {docCount}</div>
                  </div>
                  <button
                    className="text-sm px-3 py-2 rounded-lg border bg-slate-50 hover:bg-slate-100"
                    onClick={() => toggleTutor(group.tutorId)}
                  >
                    {isOpen ? 'Hide details' : 'Review'}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-4">
                    {detail?.loading && <div className="text-sm text-slate-500">Loading details…</div>}
                    {detail?.error && <div className="text-sm text-rose-600">{detail.error}</div>}

                    {detail?.data?.application && (
                      <div className="rounded-xl border p-3 bg-slate-50">
                        <div className="font-semibold text-sm mb-2">Submitted details</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-700">
                          {[
                            ['Full name', detail.data.application.fullName],
                            ['Phone', detail.data.application.phone],
                            ['Country', detail.data.application.country],
                            ['DOB', new Date(detail.data.application.dob).toLocaleDateString()],
                            ['Address 1', detail.data.application.address1],
                            ['Address 2', detail.data.application.address2 || '—'],
                            ['City', detail.data.application.city],
                            ['State', detail.data.application.state || '—'],
                            ['Postal', detail.data.application.postalCode || '—'],
                            ['Bank holder', detail.data.application.bankAccountHolder],
                            ['Bank name', detail.data.application.bankName],
                            ['Bank branch', detail.data.application.bankBranch || '—'],
                            ['Account #', detail.data.application.accountNumber || '—'],
                            ['IFSC', detail.data.application.ifsc || '—'],
                            ['UPI', detail.data.application.upiId || '—'],
                            ['IBAN', detail.data.application.iban || '—'],
                            ['SWIFT', detail.data.application.swift || '—'],
                          ].map(([label, value]) => (
                            <div key={label as string} className="flex flex-col">
                              <span className="text-[11px] text-slate-500">{label}</span>
                              <span className="font-medium text-slate-900">{value as string}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-sm">Documents</div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Pending
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Approved
                          <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Rejected
                        </div>
                      </div>

                      {(detail?.data?.documents || group.docs).map((doc) => (
                        <div key={doc.id} className="rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-900">{doc.docType}</div>
                            <div className="text-xs text-slate-500">Submitted: {new Date(doc.createdAt).toLocaleString()}</div>
                            <div className="text-sm text-indigo-600">
                              {doc.url ? <a href={doc.url} target="_blank" rel="noreferrer">View</a> : 'No file'}
                            </div>
                            {doc.notes && <div className="text-xs text-slate-600">Notes: {doc.notes}</div>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${doc.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : doc.status === 'REJECTED' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                              {doc.status}
                            </span>
                            <button className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs" onClick={() => handleReview(doc.id, group.tutorId, 'APPROVED')}>Approve</button>
                            <button className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-800 text-xs" onClick={() => handleReview(doc.id, group.tutorId, 'PENDING')}>Keep pending</button>
                            <button className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs" onClick={() => handleReview(doc.id, group.tutorId, 'REJECTED')}>Reject</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-700">Admin comments (optional)</label>
                      <textarea
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        rows={3}
                        placeholder="Notes visible to tutor with the decision"
                        value={notes[group.tutorId] || ''}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [group.tutorId]: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
