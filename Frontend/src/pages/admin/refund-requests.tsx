import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, ArrowRight } from 'lucide-react';
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

export default function AdminRefundRequests() {
  const { showSuccess, showError } = useToast();
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [transferRequests, setTransferRequests] = useState<TokenTransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'refunds' | 'transfers'>('refunds');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

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
    </div>
  );
}
