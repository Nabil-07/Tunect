import { useEffect, useState, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, Clock, ArrowRight, ChevronDown, ChevronUp, Loader2, Calendar, AlertTriangle, DollarSign, Search, RotateCcw, RefreshCw, Banknote } from 'lucide-react';
import { http as api } from '../../api/http';
import { useToast } from '../../contexts/ToastContext';

interface RefundRequest {
  id: string;
  studentId: string;
  tutorId: string;
  tokenAmount: number;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  purchaseDate: string;
  student: {
    user: {
      email: string;
      name: string | null;
    };
  };
  tutor: {
    user: {
      email: string;
      name: string | null;
    };
  };
  admin?: {
    email: string;
  } | null;
  adminNotes?: string | null;
}

interface TokenTransferRequest {
  id: string;
  studentId: string;
  fromTutorId: string;
  toTutorId: string;
  tokenAmount: number;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  student: {
    user: {
      email: string;
      name: string | null;
    };
  };
  fromTutor: {
    user: {
      email: string;
      name: string | null;
    };
  };
  toTutor: {
    user: {
      email: string;
      name: string | null;
    };
  };
  admin?: {
    email: string;
  } | null;
  adminNotes?: string | null;
}

interface AdminBooking {
  id: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  isDemo: boolean;
  createdAt: string;
  tokensCharged: number;
  refundProcessed: boolean;
  tutor: { id: string; user: { email: string; name: string | null } };
  student: { id: string; user: { email: string; name: string | null } };
  attendance: { studentJoinedAt: string | null; tutorJoinedAt: string | null; startedAt: string | null } | null;
}

interface TutorBalance {
  tutorId: string;
  tutorName: string;
  tokens: number;
  pricePerToken: number;
  valuePaise: number;
}

interface StudentTokenPreview {
  studentId: string;
  name: string | null;
  email: string;
  unallocatedTokens: number;
  totalTokens: number;
  estimatedValuePaise: number;
  balancesByTutor: TutorBalance[];
}

interface ManualRefundHistoryItem {
  id: string;
  studentId: string;
  tutorId: string | null;
  delta: string;
  description: string | null;
  createdAt: string;
  student: { user: { name: string | null; email: string } };
  tutor: { user: { name: string | null; email: string } } | null;
}

export default function AdminRefundRequests() {
  const { showSuccess, showError } = useToast();
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [transferRequests, setTransferRequests] = useState<TokenTransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'refunds' | 'transfers' | 'bookings' | 'manual'>('refunds');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  // Manual refund state
  const [manualStudentQuery, setManualStudentQuery] = useState('');
  const [manualStudentResults, setManualStudentResults] = useState<Array<{ id: string; user: { name: string | null; email: string } }>>([]);
  const [manualStudentSearching, setManualStudentSearching] = useState(false);
  const [manualSelected, setManualSelected] = useState<StudentTokenPreview | null>(null);
  const [manualLoadingPreview, setManualLoadingPreview] = useState(false);
  const [manualReason, setManualReason] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualProcessing, setManualProcessing] = useState(false);
  const [manualConfirm, setManualConfirm] = useState(false);
  const [manualSelectedTutors, setManualSelectedTutors] = useState<Set<string>>(new Set());
  const [manualHistory, setManualHistory] = useState<ManualRefundHistoryItem[]>([]);
  const [manualHistoryLoading, setManualHistoryLoading] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const [refundsRes, transfersRes] = await Promise.all([
        api.get('/refunds/request/pending'),
        api.get('/refunds/transfer/pending'),
      ]);
      setRefundRequests(refundsRes.data || []);
      setTransferRequests(transfersRes.data || []);
    } catch (err: any) {
      showError('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const processRefund = async (requestId: string, approved: boolean) => {
    try {
      setProcessingId(requestId);
      await api.post(`/refunds/request/${requestId}/process`, {
        approved,
        adminNotes: adminNotes[requestId] || undefined,
      });
      showSuccess(`Refund request ${approved ? 'approved' : 'rejected'}`);
      delete adminNotes[requestId];
      loadRequests();
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to process request');
    } finally {
      setProcessingId(null);
    }
  };

  const processTransfer = async (requestId: string, approved: boolean) => {
    try {
      setProcessingId(requestId);
      await api.post(`/refunds/transfer/${requestId}/process`, {
        approved,
        adminNotes: adminNotes[requestId] || undefined,
      });
      showSuccess(`Transfer request ${approved ? 'approved' : 'rejected'}`);
      delete adminNotes[requestId];
      loadRequests();
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to process request');
    } finally {
      setProcessingId(null);
    }
  };

  const searchStudents = useCallback(async (q: string) => {
    if (!q.trim()) { setManualStudentResults([]); return; }
    try {
      setManualStudentSearching(true);
      const { data } = await api.get('/admin/students', { params: { q, pageSize: 8 } });
      const items = Array.isArray(data) ? data : (data?.items ?? []);
      setManualStudentResults(items.map((s: any) => ({ id: s.id, user: { name: s.user?.name ?? null, email: s.user?.email ?? '' } })));
    } catch { setManualStudentResults([]); }
    finally { setManualStudentSearching(false); }
  }, []);

  const onManualQueryChange = (v: string) => {
    setManualStudentQuery(v);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => searchStudents(v), 400);
  };

  const selectStudentForRefund = async (studentId: string) => {
    setManualStudentResults([]);
    setManualSelected(null);
    setManualSelectedTutors(new Set());
    setManualConfirm(false);
    try {
      setManualLoadingPreview(true);
      const { data } = await api.get(`/refunds/student/${studentId}/balances`);
      setManualSelected(data);
      // default: all tutors selected
      setManualSelectedTutors(new Set((data.balancesByTutor as TutorBalance[]).map((b) => b.tutorId)));
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to load student balances');
    } finally { setManualLoadingPreview(false); }
  };

  const toggleTutor = (tutorId: string) => {
    setManualSelectedTutors((prev) => {
      const next = new Set(prev);
      if (next.has(tutorId)) next.delete(tutorId); else next.add(tutorId);
      return next;
    });
    setManualConfirm(false);
  };

  const loadManualHistory = useCallback(async () => {
    try {
      setManualHistoryLoading(true);
      const { data } = await api.get('/refunds/manual/history', { params: { page: 1, pageSize: 30 } });
      setManualHistory(data?.items ?? []);
    } catch { setManualHistory([]); }
    finally { setManualHistoryLoading(false); }
  }, []);

  useEffect(() => { if (activeTab === 'manual') loadManualHistory(); }, [activeTab, loadManualHistory]);

  const submitManualRefund = async () => {
    if (!manualSelected || !manualReason.trim() || manualSelectedTutors.size === 0) return;
    const allSelected = manualSelected.balancesByTutor.every((b) => manualSelectedTutors.has(b.tutorId));
    try {
      setManualProcessing(true);
      const { data } = await api.post('/refunds/manual', {
        studentId: manualSelected.studentId,
        reason: manualReason.trim(),
        note: manualNote.trim() || undefined,
        // only send tutorIds when it's a partial refund; omit for full refund
        tutorIds: allSelected ? undefined : Array.from(manualSelectedTutors),
      });
      showSuccess(`Refunded ${data.tokensRefunded} tokens from ${data.studentEmail}`);
      setManualSelected(null);
      setManualStudentQuery('');
      setManualSelectedTutors(new Set());
      setManualReason('');
      setManualNote('');
      setManualConfirm(false);
      loadManualHistory();
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Manual refund failed');
    } finally { setManualProcessing(false); }
  };

  return (
    <div className="container mx-auto px-4 py-8" data-testid="refund-requests-page">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Refund & Transfer Requests</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('refunds')}
          data-testid="refund-requests-refunds-tab"
          className={`px-4 py-2 rounded-lg font-medium ${
            activeTab === 'refunds'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          Refund Requests ({refundRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('transfers')}
          data-testid="refund-requests-transfers-tab"
          className={`px-4 py-2 rounded-lg font-medium ${
            activeTab === 'transfers'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          Transfer Requests ({transferRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('bookings')}
          data-testid="refund-requests-bookings-tab"
          className={`px-4 py-2 rounded-lg font-medium ${
            activeTab === 'bookings'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          Booking Management
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          data-testid="refund-requests-manual-tab"
          className={`px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 ${
            activeTab === 'manual'
              ? 'bg-rose-600 text-white'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          <Banknote className="h-4 w-4" />
          Manual Refund
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : activeTab === 'refunds' ? (
        <div className="space-y-4">
          {refundRequests.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No pending refund requests</div>
          ) : (
            refundRequests.map((req) => (
              <div key={req.id} className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      Refund Request from {req.student.user.name || req.student.user.email}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Tutor: {req.tutor.user.name || req.tutor.user.email}
                    </p>
                    <p className="text-sm text-slate-600">
                      Amount: <span className="font-semibold">{Number(req.tokenAmount).toFixed(2)} tokens</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Requested: {new Date(req.createdAt).toLocaleString()} | 
                      Purchase Date: {new Date(req.purchaseDate).toLocaleDateString()}
                    </p>
                    {req.reason && (
                      <p className="text-sm text-slate-700 mt-2 bg-slate-50 p-2 rounded">
                        Reason: {req.reason}
                      </p>
                    )}
                  </div>
                  <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
                    <Clock className="w-3 h-3 inline mr-1" />
                    PENDING
                  </span>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Admin Notes (optional)
                  </label>
                  <textarea
                    value={adminNotes[req.id] || ''}
                    onChange={(e) => setAdminNotes({ ...adminNotes, [req.id]: e.target.value })}
                    data-testid={`refund-notes-${req.id}`}
                    className="w-full rounded-lg border px-3 py-2 text-sm mb-3"
                    placeholder="Add notes for this decision..."
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => processRefund(req.id, true)}
                      disabled={processingId === req.id}
                      data-testid={`refund-approve-${req.id}`}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => processRefund(req.id, false)}
                      disabled={processingId === req.id}
                      data-testid={`refund-reject-${req.id}`}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {transferRequests.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No pending transfer requests</div>
          ) : (
            transferRequests.map((req) => (
              <div key={req.id} className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      Transfer Request from {req.student.user.name || req.student.user.email}
                    </h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-sm text-slate-600">
                        {req.fromTutor.user.name || req.fromTutor.user.email}
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">
                        {req.toTutor.user.name || req.toTutor.user.email}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">
                      Amount: <span className="font-semibold">{Number(req.tokenAmount).toFixed(2)} tokens</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Requested: {new Date(req.createdAt).toLocaleString()}
                    </p>
                    {req.reason && (
                      <p className="text-sm text-slate-700 mt-2 bg-slate-50 p-2 rounded">
                        Reason: {req.reason}
                      </p>
                    )}
                  </div>
                  <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
                    <Clock className="w-3 h-3 inline mr-1" />
                    PENDING
                  </span>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Admin Notes (optional)
                  </label>
                  <textarea
                    value={adminNotes[req.id] || ''}
                    onChange={(e) => setAdminNotes({ ...adminNotes, [req.id]: e.target.value })}
                    data-testid={`transfer-notes-${req.id}`}
                    className="w-full rounded-lg border px-3 py-2 text-sm mb-3"
                    placeholder="Add notes for this decision..."
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => processTransfer(req.id, true)}
                      disabled={processingId === req.id}
                      data-testid={`transfer-approve-${req.id}`}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => processTransfer(req.id, false)}
                      disabled={processingId === req.id}
                      data-testid={`transfer-reject-${req.id}`}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'bookings' && <BookingManagementTab />}

      {activeTab === 'manual' && (
        <div className="space-y-6">
          {/* Search & Preview */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <Banknote className="h-5 w-5 text-rose-600" />
              Manual Token Refund
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              Zero-out all tokens for a student and record a REFUND ledger entry. The student will lose
              all booking/messaging access until they purchase new tokens.
            </p>

            {/* Student Search */}
            <div className="relative mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Search student by name or email</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  placeholder="e.g. tunect@example.com"
                  value={manualStudentQuery}
                  onChange={(e) => onManualQueryChange(e.target.value)}
                />
                {manualStudentSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
                )}
              </div>
              {manualStudentResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden">
                  {manualStudentResults.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setManualStudentQuery(s.user.email); selectStudentForRefund(s.id); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm"
                    >
                      <span className="font-medium text-slate-900">{s.user.name || '(no name)'}</span>
                      <span className="ml-2 text-slate-500">{s.user.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Balance Preview */}
            {manualLoadingPreview && (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading balances…
              </div>
            )}
            {manualSelected && !manualLoadingPreview && (
              <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{manualSelected.name || manualSelected.email}</p>
                    <p className="text-xs text-slate-500">{manualSelected.email} · ID: {manualSelected.studentId}</p>
                  </div>
                  <button onClick={() => { setManualSelected(null); setManualStudentQuery(''); setManualSelectedTutors(new Set()); setManualConfirm(false); }} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
                </div>

                {/* Token breakdown with per-tutor checkboxes */}
                {(() => {
                  const selectedBalances = manualSelected.balancesByTutor.filter(
                    (b) => manualSelectedTutors.has(b.tutorId),
                  );
                  const selectedTokens = selectedBalances.reduce((s, b) => s + b.tokens, 0);
                  const selectedValuePaise = selectedBalances.reduce((s, b) => s + b.valuePaise, 0);
                  const allSelected = manualSelected.balancesByTutor.every((b) => manualSelectedTutors.has(b.tutorId));
                  const noneSelected = manualSelectedTutors.size === 0;

                  return (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                            Select tutors to refund
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setManualSelectedTutors(new Set(manualSelected.balancesByTutor.map((b) => b.tutorId))); setManualConfirm(false); }}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Select All
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              onClick={() => { setManualSelectedTutors(new Set()); setManualConfirm(false); }}
                              className="text-xs text-slate-500 hover:underline"
                            >
                              Deselect All
                            </button>
                          </div>
                        </div>

                        {manualSelected.balancesByTutor.length === 0 && manualSelected.unallocatedTokens === 0 ? (
                          <p className="text-sm text-slate-500 italic">This student has no tokens.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {manualSelected.balancesByTutor.map((b) => {
                              const checked = manualSelectedTutors.has(b.tutorId);
                              return (
                                <label
                                  key={b.tutorId}
                                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                                    checked
                                      ? 'bg-rose-100 border-rose-300'
                                      : 'bg-white border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleTutor(b.tutorId)}
                                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-400"
                                  />
                                  <span className="flex-1 text-sm font-medium text-slate-800">{b.tutorName}</span>
                                  <span className="text-sm text-slate-600">
                                    {b.tokens.toFixed(2)} tokens
                                  </span>
                                  <span className={`text-sm font-semibold ${checked ? 'text-rose-700' : 'text-slate-500'}`}>
                                    ₹{(b.valuePaise / 100).toFixed(2)}
                                  </span>
                                </label>
                              );
                            })}
                            {manualSelected.unallocatedTokens > 0 && (
                              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50">
                                <span className="text-sm text-slate-500 flex-1 italic">Unallocated (included in full refund)</span>
                                <span className="text-sm text-slate-600">{manualSelected.unallocatedTokens} tokens</span>
                              </div>
                            )}
                            {selectedTokens > 0 && (
                              <div className="pt-2 mt-1 border-t border-rose-200 flex justify-between text-sm font-semibold">
                                <span className="text-rose-700">
                                  Selected ({manualSelectedTutors.size} tutor{manualSelectedTutors.size !== 1 ? 's' : ''}
                                  {allSelected ? ' — full refund' : ''})
                                </span>
                                <span className="text-rose-800">
                                  {selectedTokens.toFixed(2)} tokens · ≈₹{(selectedValuePaise / 100).toFixed(2)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Reason + Note */}
                      {selectedTokens > 0 && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Reason <span className="text-rose-500">*</span></label>
                            <input
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                              placeholder="e.g. Student requested cash refund, payment dispute resolved"
                              value={manualReason}
                              onChange={(e) => setManualReason(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Internal note (optional)</label>
                            <input
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                              placeholder="Any internal note for audit trail"
                              value={manualNote}
                              onChange={(e) => setManualNote(e.target.value)}
                            />
                          </div>

                          {noneSelected ? (
                            <p className="text-xs text-slate-500 italic text-center py-1">Select at least one tutor to proceed.</p>
                          ) : !manualConfirm ? (
                            <button
                              disabled={!manualReason.trim()}
                              onClick={() => setManualConfirm(true)}
                              className="w-full py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                              <Banknote className="h-4 w-4" />
                              Review & Confirm Refund
                            </button>
                          ) : (
                            <div className="rounded-lg border border-rose-400 bg-rose-100 p-4 space-y-3">
                              <p className="text-sm font-semibold text-rose-800 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                This action is irreversible
                              </p>
                              <p className="text-sm text-rose-700">
                                You are about to refund <strong>{selectedTokens.toFixed(2)} tokens</strong> (≈₹{(selectedValuePaise / 100).toFixed(2)}) from{' '}
                                <strong>{manualSelected.name || manualSelected.email}</strong>
                                {!allSelected && (
                                  <> for <strong>{manualSelectedTutors.size} tutor{manualSelectedTutors.size !== 1 ? 's' : ''}</strong> only</>
                                )}.
                                {allSelected && ' The student will lose all booking/messaging access until they purchase new tokens.'}
                              </p>
                              <div className="flex gap-3">
                                <button
                                  onClick={submitManualRefund}
                                  disabled={manualProcessing}
                                  className="flex-1 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                  {manualProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                  Yes, process refund
                                </button>
                                <button
                                  onClick={() => setManualConfirm(false)}
                                  disabled={manualProcessing}
                                  className="flex-1 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Manual Refund History */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Refund History</h3>
              <button onClick={loadManualHistory} className="text-xs text-slate-500 flex items-center gap-1 hover:text-slate-700">
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
            {manualHistoryLoading ? (
              <div className="py-6 flex items-center justify-center text-slate-400 gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : manualHistory.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No manual refunds recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                      <th className="pb-2 pr-4">Date</th>
                      <th className="pb-2 pr-4">Student</th>
                      <th className="pb-2 pr-4">Tutor</th>
                      <th className="pb-2 pr-4">Tokens</th>
                      <th className="pb-2 pr-4">Value (₹)</th>
                      <th className="pb-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {manualHistory.map((h) => {
                      let meta: any = {};
                      try { meta = JSON.parse(h.description ?? '{}'); } catch { /* */ }
                      return (
                        <tr key={h.id} className="text-slate-700">
                          <td className="py-2 pr-4 whitespace-nowrap text-xs text-slate-500">
                            {new Date(h.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="py-2 pr-4">
                            <p className="font-medium text-slate-800">{h.student?.user?.name || '—'}</p>
                            <p className="text-xs text-slate-400">{h.student?.user?.email}</p>
                          </td>
                          <td className="py-2 pr-4 text-xs">
                            {h.tutor ? (h.tutor.user?.name || h.tutor.user?.email) : <span className="text-slate-400">Unallocated</span>}
                          </td>
                          <td className="py-2 pr-4 font-mono font-semibold text-rose-700">
                            {Math.abs(Number(h.delta)).toFixed(2)}
                          </td>
                          <td className="py-2 pr-4 text-slate-700">
                            {meta.amountInPaise ? `₹${(meta.amountInPaise / 100).toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 text-xs text-slate-600 max-w-xs truncate" title={meta.reason}>
                            {meta.reason || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Booking Management Tab ─────────────── */

function BookingManagementTab() {
  const { showError } = useToast();
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'demo' | 'paid'>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { page, pageSize: 20, sortBy: 'startTime', sortDir: 'desc' };
      if (search) params.q = search;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      const { data } = await api.get('/admin/bookings', { params });
      setBookings(data.items || []);
      setTotalPages(data.meta?.totalPages || 1);
    } catch {
      showError('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, typeFilter]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  const statusColor = (s: string) => {
    if (s === 'COMPLETED') return 'bg-green-100 text-green-700';
    if (s === 'CONFIRMED') return 'bg-blue-100 text-blue-700';
    if (s === 'CANCELED') return 'bg-slate-200 text-slate-600';
    if (s.includes('NO_SHOW') || s.includes('AUTO_CANCELLED')) return 'bg-red-100 text-red-700';
    if (s === 'LIVE' || s === 'WAITING_ROOM') return 'bg-purple-100 text-purple-700';
    return 'bg-amber-100 text-amber-700';
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg border border-slate-200 p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by student or tutor name/email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="AUTO_CANCELLED_TUTOR_NO_SHOW">Tutor No-Show</option>
          <option value="CANCELED">Canceled</option>
          <option value="PENDING">Pending</option>
          <option value="PENDING_SLOT">Pending Slot</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value as '' | 'demo' | 'paid'); setPage(1); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All Types</option>
          <option value="demo">Demo</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {/* Bookings List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-8 text-slate-500">No bookings found</div>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => (
            <div key={b.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {/* Summary Row */}
              <button
                onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                className="w-full px-4 py-3 flex items-center gap-4 hover:bg-slate-50 transition text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-slate-500">{b.id.slice(0, 10)}…</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(b.status)}`}>
                      {b.status.replace(/_/g, ' ')}
                    </span>
                    {b.isDemo && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">DEMO</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1 text-sm">
                    <span className="text-slate-600">
                      <strong>Student:</strong> {b.student.user.name || b.student.user.email}
                    </span>
                    <span className="text-slate-600">
                      <strong>Tutor:</strong> {b.tutor.user.name || b.tutor.user.email}
                    </span>
                    {b.startTime && (
                      <span className="text-slate-500">
                        {new Date(b.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {' '}
                        {new Date(b.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <span className="text-slate-500">
                      Tokens: {Number(b.tokensCharged)}
                    </span>
                  </div>
                </div>
                {expandedId === b.id ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </button>

              {/* Expanded Actions */}
              {expandedId === b.id && (
                <BookingActions booking={b} onDone={loadBookings} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Expanded Booking Actions Panel ─────────────── */

function BookingActions({ booking, onDone }: { booking: AdminBooking; onDone: () => void }) {
  const { showSuccess, showError } = useToast();
  const [processing, setProcessing] = useState<string | null>(null);

  // Slot state — loaded on mount
  const [slots, setSlots] = useState<Array<{ startTime: string; endTime: string }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [rescheduleNotes, setRescheduleNotes] = useState('');

  // Cleanup options
  const [removeDemerit, setRemoveDemerit] = useState(false);
  const [removeEarning, setRemoveEarning] = useState(false);

  const canReschedule = ['COMPLETED', 'AUTO_CANCELLED_TUTOR_NO_SHOW', 'AUTO_CANCELLED_STUDENT_NO_SHOW', 'CANCELED', 'CONFIRMED', 'FAILED_TECHNICAL'].includes(booking.status);
  const canReverseDemerit = !booking.isDemo;
  const canReverseEarning = !booking.isDemo;

  // Load next 14 days of availability on mount
  useEffect(() => {
    if (!canReschedule) return;
    const fetch = async () => {
      try {
        setSlotsLoading(true);
        const from = new Date();
        from.setHours(0, 0, 0, 0);
        const to = new Date(from);
        to.setDate(to.getDate() + 14);
        const { data } = await api.get(`/tutors/${booking.tutor.id}/availability`, {
          params: { from: from.toISOString(), to: to.toISOString() },
        });
        let available: Array<{ startTime: string; endTime: string }> = Array.isArray(data) ? data : [];
        // For demo bookings, cap each slot to 30 minutes
        if (booking.isDemo) {
          available = available.map(s => {
            const start = new Date(s.startTime);
            const cappedEnd = new Date(start.getTime() + 30 * 60 * 1000);
            const originalEnd = new Date(s.endTime);
            return { startTime: s.startTime, endTime: cappedEnd < originalEnd ? cappedEnd.toISOString() : s.endTime };
          });
        }
        // Only future slots
        const now = Date.now();
        setSlots(available.filter(s => new Date(s.startTime).getTime() > now));
      } catch {
        // silently fail — show empty state
      } finally {
        setSlotsLoading(false);
        setSlotsLoaded(true);
      }
    };
    fetch();
  }, [booking.tutor.id, canReschedule]);

  // Group slots by local date label
  const slotsByDate = slots.reduce<Record<string, Array<{ startTime: string; endTime: string }>>>((acc, s) => {
    const label = new Date(s.startTime).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    if (!acc[label]) acc[label] = [];
    acc[label].push(s);
    return acc;
  }, {});

  const handleReschedule = async () => {
    if (!selectedSlot) {
      showError('Please select an available time slot');
      return;
    }
    try {
      setProcessing('reschedule');

      if (removeDemerit) {
        try { await api.post(`/admin/bookings/${booking.id}/reverse-demerit`); }
        catch (err: any) { console.warn('Demerit reversal skipped:', err?.response?.data?.message); }
      }

      if (removeEarning && !booking.isDemo) {
        try { await api.post(`/admin/bookings/${booking.id}/reverse-earning`); }
        catch (err: any) { console.warn('Earning reversal skipped:', err?.response?.data?.message); }
      }

      await api.post(`/admin/bookings/${booking.id}/reschedule`, {
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        notes: rescheduleNotes || undefined,
      });
      showSuccess('Booking rescheduled successfully');
      onDone();
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to reschedule');
    } finally {
      setProcessing(null);
    }
  };

  const handleReverseDemerit = async () => {
    try {
      setProcessing('demerit');
      await api.post(`/admin/bookings/${booking.id}/reverse-demerit`);
      showSuccess('Demerit point reversed');
      onDone();
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to reverse demerit');
    } finally {
      setProcessing(null);
    }
  };

  const handleReverseEarning = async () => {
    try {
      setProcessing('earning');
      await api.post(`/admin/bookings/${booking.id}/reverse-earning`);
      showSuccess('Earning reversed');
      onDone();
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to reverse earning');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 space-y-4">
      {/* Booking Details */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">Booking ID</p>
          <p className="font-mono text-xs">{booking.id}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Student</p>
          <p className="font-medium">{booking.student.user.name || '—'}</p>
          <p className="text-xs text-slate-500">{booking.student.user.email}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Tutor</p>
          <p className="font-medium">{booking.tutor.user.name || '—'}</p>
          <p className="text-xs text-slate-500">{booking.tutor.user.email}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Attendance</p>
          {booking.attendance ? (
            <div className="text-xs space-y-0.5">
              <p>Student: {booking.attendance.studentJoinedAt ? '✅ Joined' : '❌ No'}</p>
              <p>Tutor: {booking.attendance.tutorJoinedAt ? '✅ Joined' : '❌ No'}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No data</p>
          )}
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Reschedule Card */}
        {canReschedule && (
          <div className="bg-white rounded-lg border border-blue-200 p-4">
            <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-1.5 mb-3">
              <Calendar className="w-4 h-4" />
              Reschedule Booking
            </h4>
            <div className="space-y-3">
              {/* Slot list — auto-loaded */}
              {slotsLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-3">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading tutor's upcoming slots…
                </div>
              ) : slotsLoaded && slots.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
                  <p className="text-sm font-medium text-slate-600">No available slots for this tutor</p>
                  <p className="text-xs text-slate-400 mt-1">No slots found in the next 14 days</p>
                </div>
              ) : slots.length > 0 ? (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {Object.entries(slotsByDate).map(([dateLabel, dateSlots]) => (
                    <div key={dateLabel}>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">{dateLabel}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {dateSlots.map((s, i) => {
                          const isSelected = selectedSlot?.startTime === s.startTime;
                          const fmt = (iso: string) =>
                            new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setSelectedSlot(s)}
                              className={`text-xs rounded-lg border px-2 py-1.5 text-left transition ${
                                isSelected
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-700'
                              }`}
                            >
                              {fmt(s.startTime)} – {fmt(s.endTime)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-0.5">Notes (optional)</label>
                <input
                  type="text"
                  value={rescheduleNotes}
                  onChange={(e) => setRescheduleNotes(e.target.value)}
                  placeholder="Reason for rescheduling"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>

              {/* Cleanup options during reschedule */}
              {!booking.isDemo && (
                <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-800">Cleanup for original booking:</p>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={removeDemerit}
                      onChange={(e) => setRemoveDemerit(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    Remove demerit point earned against this booking
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={removeEarning}
                      onChange={(e) => setRemoveEarning(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    Remove tutor earning against this booking
                  </label>
                </div>
              )}

              <button
                onClick={handleReschedule}
                disabled={processing === 'reschedule' || !selectedSlot}
                className="w-full mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing === 'reschedule' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {selectedSlot
                  ? `Reschedule to ${new Date(selectedSlot.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Select a slot first'}
              </button>
            </div>
          </div>
        )}

        {/* Standalone Actions Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-800">Quick Actions</h4>

          {/* Reverse Demerit */}
          {canReverseDemerit && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <p className="text-xs font-medium text-orange-800 flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Reverse Demerit Point
              </p>
              <p className="text-xs text-orange-700 mb-2">
                Removes 1 demerit point from the tutor and reverses any penalty deduction for this booking.
              </p>
              <button
                onClick={handleReverseDemerit}
                disabled={!!processing}
                className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {processing === 'demerit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                Reverse Demerit
              </button>
            </div>
          )}

          {/* Reverse Earning */}
          {canReverseEarning && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs font-medium text-rose-800 flex items-center gap-1.5 mb-2">
                <DollarSign className="w-3.5 h-3.5" />
                Reverse Tutor Earning
              </p>
              <p className="text-xs text-rose-700 mb-2">
                Removes the BOOKING_EARNED wallet entry and deducts the amount from tutor wallet.
              </p>
              <button
                onClick={handleReverseEarning}
                disabled={!!processing}
                className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {processing === 'earning' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
                Reverse Earning
              </button>
            </div>
          )}

          {booking.isDemo && (
            <p className="text-xs text-slate-500 italic">
              Demo class — no earning/demerit cleanup needed. Only reschedule is available.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
