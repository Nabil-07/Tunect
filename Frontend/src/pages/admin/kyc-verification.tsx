// src/pages/admin/kyc-verification.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchKycQueue, fetchKycBundle, requestKycResubmission, reviewKyc, type KycItem, type KycBundle } from '../../services/adminService';

/** Resolve a doc URL so it always points at the API server, not the frontend SPA. */
const resolveDocUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  // Already absolute → use as-is
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Relative path (e.g. /uploads/open/…) → prefix with API base
  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
};

const RESUBMISSION_FIELD_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'fullName', label: 'Full name' },
  { key: 'dob', label: 'Date of birth' },
  { key: 'phone', label: 'Phone' },
  { key: 'country', label: 'Country' },
  { key: 'addressLine1', label: 'Address line 1' },
  { key: 'addressLine2', label: 'Address line 2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State/Province' },
  { key: 'postalCode', label: 'Postal code' },
  { key: 'bankAccountHolder', label: 'Bank account holder' },
  { key: 'bankName', label: 'Bank name' },
  { key: 'bankBranch', label: 'Bank branch' },
  { key: 'accountNumber', label: 'Account number' },
  { key: 'ifsc', label: 'IFSC' },
  { key: 'upiId', label: 'UPI ID' },
  { key: 'iban', label: 'IBAN' },
  { key: 'swift', label: 'SWIFT' },
  { key: 'selfie', label: 'Selfie document' },
  { key: 'degreeCertificates', label: 'Degree certificates' },
];

function splitLatestAndOlderDocuments(docs: KycItem[]) {
  const sorted = [...docs].sort((a, b) => {
    const aTs = new Date(a.createdAt).getTime();
    const bTs = new Date(b.createdAt).getTime();
    return bTs - aTs;
  });

  const seenTypes = new Set<string>();
  const latest: KycItem[] = [];
  const older: KycItem[] = [];

  for (const doc of sorted) {
    const key = String(doc.docType || '').trim().toLowerCase() || 'document';
    if (seenTypes.has(key)) {
      older.push(doc);
    } else {
      seenTypes.add(key);
      latest.push(doc);
    }
  }

  return { latest, older };
}

export default function AdminKYCVerification() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<KycItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTutorId, setExpandedTutorId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, { loading: boolean; data?: KycBundle; error?: string }>>({});
  const [showOlderDocs, setShowOlderDocs] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [correctionFields, setCorrectionFields] = useState<Record<string, string[]>>({});
  const [requestingResubmission, setRequestingResubmission] = useState<Record<string, boolean>>({});
  const focusedTutorId = String(searchParams.get('tutorId') || '').trim();
  const focusedDocId = String(searchParams.get('docId') || '').trim();

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

  const loadDetails = useCallback(async (tutorId: string) => {
    setDetails((prev) => ({ ...prev, [tutorId]: { loading: true } }));
    try {
      const data = await fetchKycBundle(tutorId);
      setDetails((prev) => ({ ...prev, [tutorId]: { loading: false, data } }));
    } catch (err: any) {
      setDetails((prev) => ({ ...prev, [tutorId]: { loading: false, error: err?.response?.data?.message || 'Failed to load details' } }));
    }
  }, []);

  useEffect(() => {
    if (!focusedTutorId) return;
    setExpandedTutorId((prev) => prev || focusedTutorId);
    if (!details[focusedTutorId]) {
      loadDetails(focusedTutorId);
    }
  }, [focusedTutorId, details, loadDetails]);

  const toggleTutor = (tutorId: string) => {
    setExpandedTutorId((prev) => (prev === tutorId ? null : tutorId));
    if (!details[tutorId]) {
      loadDetails(tutorId);
    }
  };

  const displayGroups = useMemo(() => {
    if (!focusedTutorId) return grouped;

    const existing = grouped.find((group) => group.tutorId === focusedTutorId);
    if (existing) {
      return [existing, ...grouped.filter((group) => group.tutorId !== focusedTutorId)];
    }

    const detail = details[focusedTutorId]?.data;
    if (detail) {
      return [
        {
          tutorId: focusedTutorId,
          email: detail.tutor?.user?.email || focusedTutorId,
          docs: detail.documents || [],
        },
        ...grouped,
      ];
    }

    return [
      {
        tutorId: focusedTutorId,
        email: focusedTutorId,
        docs: [],
      },
      ...grouped,
    ];
  }, [grouped, focusedTutorId, details]);

  const toggleCorrectionField = (tutorId: string, field: string) => {
    setCorrectionFields((prev) => {
      const current = new Set(prev[tutorId] || []);
      if (current.has(field)) current.delete(field);
      else current.add(field);
      return { ...prev, [tutorId]: Array.from(current) };
    });
  };

  const handleRequestResubmission = async (tutorId: string) => {
    if (requestingResubmission[tutorId]) return;

    const selected = correctionFields[tutorId] || [];
    if (!selected.length) {
      setError('Select at least one field before requesting resubmission.');
      return;
    }

    try {
      setRequestingResubmission((prev) => ({ ...prev, [tutorId]: true }));
      setError(null);
      await requestKycResubmission(tutorId, selected, notes[tutorId]);
      await loadDetails(tutorId);
      setCorrectionFields((prev) => ({ ...prev, [tutorId]: [] }));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to request resubmission');
    } finally {
      setRequestingResubmission((prev) => ({ ...prev, [tutorId]: false }));
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
        {focusedTutorId && (
          <p className="text-xs text-slate-500 mt-1">
            Focused tutor: {focusedTutorId}
          </p>
        )}
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}

      {loading ? (
        <div className="text-slate-600">Loading KYC queue...</div>
      ) : displayGroups.length === 0 ? (
        <div className="text-slate-600">No pending KYC submissions.</div>
      ) : (
        <div className="space-y-3">
          {displayGroups.map((group) => {
            const isOpen = expandedTutorId === group.tutorId;
            const detail = details[group.tutorId];
            const docCount = detail?.data?.documents?.length ?? group.docs.length;
            return (
              <div key={group.tutorId} className="border border-slate-200 rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-900">{group.email}</div>
                    <div className="text-xs text-slate-500">Pending documents: {docCount}</div>
                    <Link to={`/admin/tutors/${group.tutorId}`} className="text-xs text-blue-600 hover:underline">
                      Open tutor profile
                    </Link>
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
                        {detail.data.application.correctionRequest?.fields?.length ? (
                          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                            <div className="font-semibold">Resubmission requested for:</div>
                            <div>{detail.data.application.correctionRequest.fields.join(', ')}</div>
                            {detail.data.application.correctionRequest.message && (
                              <div className="mt-1">Message: {detail.data.application.correctionRequest.message}</div>
                            )}
                          </div>
                        ) : null}
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
                      {(() => {
                        const allDocs = detail?.data?.documents || group.docs;
                        const { latest, older } = splitLatestAndOlderDocuments(allDocs);
                        const forcedByFocus = !!focusedDocId && older.some((doc) => doc.id === focusedDocId);
                        const expandedOlder = forcedByFocus || !!showOlderDocs[group.tutorId];
                        const docsToRender = expandedOlder ? [...latest, ...older] : latest;

                        return (
                          <>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-sm">Documents</div>
                        <div className="flex items-center gap-3">
                          {older.length > 0 && (
                            <button
                              type="button"
                              className="text-xs px-2 py-1 rounded border bg-slate-50 hover:bg-slate-100 text-slate-700"
                              onClick={() => setShowOlderDocs((prev) => ({ ...prev, [group.tutorId]: !expandedOlder }))}
                            >
                              {expandedOlder ? '▲ Minimise older records' : `▼ Expand older records (${older.length})`}
                            </button>
                          )}
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Pending
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Approved
                            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Rejected
                          </div>
                        </div>
                      </div>

                      {docsToRender.map((doc) => (
                        <div key={doc.id} className={`rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3 ${doc.id === focusedDocId ? 'ring-2 ring-blue-300 border-blue-300' : ''}`}>
                          <div>
                            <div className="font-medium text-slate-900">{doc.docType}</div>
                            <div className="text-xs text-slate-500">Submitted: {new Date(doc.createdAt).toLocaleString()}</div>
                            <div className="text-sm text-indigo-600">
                              {doc.url ? <a href={resolveDocUrl(doc.url)} target="_blank" rel="noreferrer">View</a> : 'No file'}
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
                          </>
                        );
                      })()}
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

                    <div className="rounded-xl border p-3 space-y-3">
                      <div className="font-semibold text-sm">Request tutor resubmission (field-level)</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="px-2.5 py-1.5 rounded-lg border text-xs text-slate-700 bg-slate-50 hover:bg-slate-100"
                          onClick={() => setCorrectionFields((prev) => ({
                            ...prev,
                            [group.tutorId]: RESUBMISSION_FIELD_OPTIONS.map((field) => field.key),
                          }))}
                        >
                          Select full KYC
                        </button>
                        <button
                          type="button"
                          className="px-2.5 py-1.5 rounded-lg border text-xs text-slate-700 bg-slate-50 hover:bg-slate-100"
                          onClick={() => setCorrectionFields((prev) => ({ ...prev, [group.tutorId]: [] }))}
                        >
                          Clear selection
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {RESUBMISSION_FIELD_OPTIONS.map((field) => {
                          const checked = (correctionFields[group.tutorId] || []).includes(field.key);
                          return (
                            <label key={field.key} className="flex items-center gap-2 text-xs text-slate-700">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCorrectionField(group.tutorId, field.key)}
                              />
                              <span>{field.label}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="flex justify-end">
                        <button
                          className="px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-60"
                          onClick={() => handleRequestResubmission(group.tutorId)}
                          disabled={requestingResubmission[group.tutorId]}
                        >
                          {requestingResubmission[group.tutorId] ? 'Sending...' : 'Request resubmission'}
                        </button>
                      </div>
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
