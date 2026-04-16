import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Eye, Loader2, AlertCircle, TrendingUp, Users, CreditCard, X, Upload, Building2, Search, Filter, FileText, ExternalLink, ChevronDown, ChevronUp, Receipt, Printer } from 'lucide-react';
import { getStudentPayments, getTutorPaymentsDue, createPayout, markPayoutPaid, uploadPayoutSlip, listPayouts, getPayoutReceipt } from '../../../services/financeService';
import type { StudentPayment, TutorPaymentDue, PayoutRecord, PayoutReceipt } from '../../../services/financeService';

export default function PaymentsPage() {
  const [tab, setTab] = useState<'received' | 'due'>('received');
  const [studentPayments, setStudentPayments] = useState<StudentPayment[]>([]);
  const [tutorDues, setTutorDues] = useState<TutorPaymentDue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [paymentsRes, duesRes] = await Promise.all([
        getStudentPayments({ page: 1, pageSize: 100 }),
        getTutorPaymentsDue({ page: 1, pageSize: 100 }),
      ]);
      
      setStudentPayments(paymentsRes.payments || []);
      setTutorDues(duesRes.tutors || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load payments');
      console.error('Failed to load payments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const studentStats = useMemo(() => {
    return {
      totalReceived: studentPayments.reduce((sum, p) => sum + p.amount, 0),
      totalPayments: studentPayments.length,
      bannedCount: studentPayments.filter(p => p.isBanned).length,
    };
  }, [studentPayments]);

  const tutorStats = useMemo(() => {
    return {
      totalDue: tutorDues.reduce((sum, t) => sum + (t.remaining ?? (t.totalDue - t.totalPaid)), 0),
      totalPaid: tutorDues.reduce((sum, t) => sum + t.totalPaid, 0),
      blockedCount: tutorDues.filter(t => t.isBanned).length,
    };
  }, [tutorDues]);

  const formatINR = (paise: number) => {
    return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Payments & Receipts</h1>
        <p className="text-slate-600 mt-2">Track student payments received and tutor payouts due</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab('received')}
          data-testid="payments-received-tab"
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            tab === 'received'
              ? 'text-indigo-600 border-indigo-600'
              : 'text-slate-600 border-transparent hover:text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Student Payments Received
          </div>
        </button>
        <button
          onClick={() => setTab('due')}
          data-testid="payments-due-tab"
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            tab === 'due'
              ? 'text-indigo-600 border-indigo-600'
              : 'text-slate-600 border-transparent hover:text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Tutor Payouts Due
          </div>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 flex gap-3" data-testid="payments-error-alert">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {/* Student Payments Tab */}
      {tab === 'received' && (
        <StudentPaymentsTab payments={studentPayments} stats={studentStats} loading={loading} formatINR={formatINR} />
      )}

      {/* Tutor Dues Tab */}
      {tab === 'due' && (
        <TutorDuesTab dues={tutorDues} stats={tutorStats} loading={loading} formatINR={formatINR} onPayoutComplete={loadData} />
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      )}
    </div>
  );
}

function StudentPaymentsTab({
  payments,
  stats,
  loading,
  formatINR,
}: {
  payments: StudentPayment[];
  stats: { totalReceived: number; totalPayments: number; bannedCount: number };
  loading: boolean;
  formatINR: (paise: number) => string;
}) {
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [viewingPayment, setViewingPayment] = useState<StudentPayment | null>(null);

  const sorted = useMemo(() => {
    const copy = [...payments];
    if (sortBy === 'date') copy.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
    if (sortBy === 'amount') copy.sort((a, b) => b.amount - a.amount);
    return copy;
  }, [payments, sortBy]);

  const regularPayments = sorted.filter(p => !p.isBanned);
  const bannedPayments = sorted.filter(p => p.isBanned);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Total Received</p>
          <p className="text-2xl font-bold mt-1">{formatINR(stats.totalReceived)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Total Payments</p>
          <p className="text-2xl font-bold mt-1">{stats.totalPayments}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Banned Student Payments</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{stats.bannedCount}</p>
        </div>
      </div>

      {/* Regular Payments */}
      {regularPayments.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Active Student Payments</h3>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              data-testid="payments-sort-select"
              className="text-sm border border-slate-200 rounded-lg px-3 py-2"
            >
              <option value="date">Sort by Date</option>
              <option value="amount">Sort by Amount</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Order ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Student</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-700">Tokens</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Paid Date</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {regularPayments.map((payment) => (
                  <tr key={payment.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{payment.orderId}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{payment.studentName || payment.studentEmail}</p>
                        <p className="text-xs text-slate-500">{payment.studentEmail}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatINR(payment.amount)}</td>
                    <td className="px-4 py-3 text-center text-slate-700">{payment.tokensPurchased ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(payment.paidAt).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setViewingPayment(payment)}
                          title="View Details"
                          className="p-1 rounded hover:bg-slate-200 transition-colors"
                        >
                          <Eye className="w-4 h-4 text-slate-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Banned Student Payments */}
      {bannedPayments.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-rose-600">Banned Student Payments</h3>
          <div className="overflow-x-auto rounded-xl border border-rose-200 bg-rose-50">
            <table className="w-full text-sm">
              <thead className="bg-rose-100 border-b border-rose-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-rose-900">Order ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-rose-900">Student</th>
                  <th className="px-4 py-3 text-right font-semibold text-rose-900">Amount</th>
                  <th className="px-4 py-3 text-center font-semibold text-rose-900">Tokens</th>
                  <th className="px-4 py-3 text-left font-semibold text-rose-900">Paid Date</th>
                </tr>
              </thead>
              <tbody>
                {bannedPayments.map((payment) => (
                  <tr key={payment.id} className="border-b border-rose-100">
                    <td className="px-4 py-3 font-mono text-xs text-rose-700">{payment.orderId}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-rose-900">{payment.studentName || payment.studentEmail}</p>
                        <p className="text-xs text-rose-600">{payment.studentEmail}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-900">{formatINR(payment.amount)}</td>
                    <td className="px-4 py-3 text-center text-rose-700">{payment.tokensPurchased ?? '—'}</td>
                    <td className="px-4 py-3 text-rose-600">
                      {new Date(payment.paidAt).toLocaleDateString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && regularPayments.length === 0 && bannedPayments.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-12 text-center">
          <p className="text-slate-600">No student payments found</p>
        </div>
      )}

      {/* Student Payment Detail Modal */}
      {viewingPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Payment Details</h3>
                <p className="text-xs text-slate-500">Student payment receipt</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const p = viewingPayment;
                    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payment Receipt - ${p.orderId}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:40px;max-width:600px;margin:0 auto;color:#1e293b}
@media print{body{padding:20px}@page{size:A4;margin:20mm}}</style></head><body>
<div style="text-align:center;border-bottom:1px solid #e2e8f0;padding-bottom:16px;margin-bottom:20px">
<h1 style="font-size:20px;font-weight:700">Tunect Private Limited</h1>
<p style="font-size:12px;color:#64748b;margin-top:4px">Student Payment Receipt</p>
<p style="font-size:12px;font-family:monospace;color:#4f46e5;margin-top:4px">${p.orderId}</p></div>
<div style="text-align:center;margin-bottom:20px"><p style="font-size:11px;color:#64748b">Amount Paid</p>
<p style="font-size:28px;font-weight:700;color:#16a34a">${formatINR(p.amount)}</p></div>
<div style="background:#f8fafc;border-radius:8px;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
<div><p style="font-size:11px;color:#64748b">Student</p><p style="font-weight:600;font-size:13px">${p.studentName || p.studentEmail}</p><p style="font-size:11px;color:#64748b">${p.studentEmail}</p></div>
<div><p style="font-size:11px;color:#64748b">Tutor</p><p style="font-weight:600;font-size:13px">${p.tutorName}</p></div>
<div><p style="font-size:11px;color:#64748b">Tokens</p><p style="font-weight:500;font-size:13px">${p.tokensPurchased ?? '—'}</p></div>
<div><p style="font-size:11px;color:#64748b">Provider</p><p style="font-weight:500;font-size:13px;text-transform:capitalize">${p.provider || 'Razorpay'}</p></div>
<div><p style="font-size:11px;color:#64748b">Paid Date</p><p style="font-weight:500;font-size:13px">${new Date(p.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
<div><p style="font-size:11px;color:#64748b">Order ID</p><p style="font-family:monospace;font-size:11px">${p.orderId}</p></div></div>
<div style="text-align:center;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:20px">
<p style="font-size:10px;color:#94a3b8">Tunect Private Limited</p></div>
</body></html>`;
                    const printWindow = window.open('', '_blank', 'width=700,height=900');
                    if (printWindow) {
                      printWindow.document.write(html);
                      printWindow.document.close();
                      printWindow.onload = () => { printWindow.print(); };
                    }
                  }}
                  className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800 font-medium"
                  title="Print receipt"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button onClick={() => setViewingPayment(null)} className="p-1 rounded hover:bg-slate-100">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="text-center">
                <p className="text-xs text-slate-500">Amount Paid</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{formatINR(viewingPayment.amount)}</p>
              </div>

              {/* Details Grid */}
              <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Student</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{viewingPayment.studentName || viewingPayment.studentEmail}</p>
                  <p className="text-xs text-slate-500">{viewingPayment.studentEmail}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Tutor</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{viewingPayment.tutorName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Order ID</p>
                  <p className="font-mono text-xs text-slate-900 mt-0.5">{viewingPayment.orderId}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Tokens</p>
                  <p className="font-medium text-slate-900 mt-0.5">{viewingPayment.tokensPurchased ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Paid Date</p>
                  <p className="font-medium text-slate-900 mt-0.5">{new Date(viewingPayment.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Provider</p>
                  <p className="font-medium text-slate-900 mt-0.5 capitalize">{viewingPayment.provider || 'Razorpay'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TutorDuesTab({
  dues,
  stats: _stats,
  loading,
  formatINR,
  onPayoutComplete,
}: {
  dues: TutorPaymentDue[];
  stats: { totalDue: number; totalPaid: number; blockedCount: number };
  loading: boolean;
  formatINR: (paise: number) => string;
  onPayoutComplete?: () => void;
}) {
  const [expandedTutor, setExpandedTutor] = useState<string | null>(null);
  const [payoutModal, setPayoutModal] = useState<{ tutorId: string; tutorName: string; maxAmount: number; bankInfo?: any } | null>(null);
  const [payoutForm, setPayoutForm] = useState({
    amount: '',
    transactionId: '',
    paidDate: new Date().toISOString().split('T')[0],
    details: '',
    paymentMethod: 'razorpay',
    reference: '',
  });

  /* ---- Payout records (for attachments/receipts) ---- */
  const [payoutRecords, setPayoutRecords] = useState<PayoutRecord[]>([]);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [viewingSlip, setViewingSlip] = useState<{ url: string; tutorName: string; payoutId: string } | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<PayoutReceipt | null>(null);
  const [receiptLoading, setReceiptLoading] = useState<string | null>(null);

  const loadPayouts = useCallback(async () => {
    try {
      setPayoutsLoading(true);
      const records = await listPayouts();
      setPayoutRecords(records);
    } catch (err) {
      console.error('Failed to load payout records:', err);
    } finally {
      setPayoutsLoading(false);
    }
  }, []);

  useEffect(() => { loadPayouts(); }, [loadPayouts]);

  /** Get payout records for a specific tutor */
  const getTutorPayouts = useCallback((tutorId: string) => {
    return payoutRecords.filter(p => p.tutorId === tutorId);
  }, [payoutRecords]);

  /* ---- Filters ---- */
  const [searchName, setSearchName] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [commissionFilter, setCommissionFilter] = useState<'all' | '18' | '22' | '25'>('all');
  const [showFilters, setShowFilters] = useState(false);

  /** Available months from payment schedules */
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    dues.forEach(t => t.paymentSchedule.forEach(s => {
      const d = new Date(s.dueDate);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }));
    return Array.from(months).sort().reverse();
  }, [dues]);

  /** Filtered tutors */
  const filteredDues = useMemo(() => {
    return dues.filter(t => {
      // Name search
      if (searchName && !t.tutorName.toLowerCase().includes(searchName.toLowerCase()) &&
          !t.tutorEmail.toLowerCase().includes(searchName.toLowerCase())) return false;
      // Paid/Unpaid status
      const remaining = t.remaining ?? (t.totalDue - t.totalPaid);
      if (statusFilter === 'paid' && remaining > 0) return false;
      if (statusFilter === 'unpaid' && remaining <= 0) return false;
      // Commission rate
      if (commissionFilter !== 'all' && t.commissionRate !== Number(commissionFilter)) return false;
      // Month filter
      if (monthFilter !== 'all') {
        const hasMonth = t.paymentSchedule.some(s => {
          const d = new Date(s.dueDate);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === monthFilter;
        });
        if (!hasMonth) return false;
      }
      return true;
    });
  }, [dues, searchName, statusFilter, monthFilter, commissionFilter]);

  const filteredStats = useMemo(() => ({
    totalDue: filteredDues.reduce((sum, t) => sum + (t.remaining ?? (t.totalDue - t.totalPaid)), 0),
    totalPaid: filteredDues.reduce((sum, t) => sum + t.totalPaid, 0),
    blockedCount: filteredDues.filter(t => t.isBanned).length,
  }), [filteredDues]);
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSuccess, setPayoutSuccess] = useState<string | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const slipInputRef = useRef<HTMLInputElement>(null);

  function openPayoutModal(tutor: TutorPaymentDue) {
    const balance = Math.max(0, tutor.totalDue - tutor.totalPaid);
    setPayoutModal({
      tutorId: tutor.tutorId,
      tutorName: tutor.tutorName,
      maxAmount: balance,
      bankInfo: tutor.bankInfo || null,
    });
    setPayoutForm({
      amount: (balance / 100).toFixed(2),
      transactionId: '',
      paidDate: new Date().toISOString().split('T')[0],
      details: '',
      paymentMethod: 'razorpay',
      reference: '',
    });
    setPayoutError(null);
    setPayoutSuccess(null);
    setSlipFile(null);
  }

  async function handlePayoutSubmit() {
    if (!payoutModal) return;
    const amountNum = parseFloat(payoutForm.amount);
    if (!amountNum || amountNum <= 0) {
      setPayoutError('Enter a valid amount');
      return;
    }
    if (!payoutForm.transactionId.trim()) {
      setPayoutError('Transaction ID is required');
      return;
    }
    try {
      setPayoutSubmitting(true);
      setPayoutError(null);
      // Create payout and immediately mark as PAID
      const payout = await createPayout({
        tutorId: payoutModal.tutorId,
        amount: amountNum,
        reference: payoutForm.reference || undefined,
        transactionId: payoutForm.transactionId,
        details: payoutForm.details || undefined,
        paymentMethod: payoutForm.paymentMethod,
      });
      await markPayoutPaid(payout.id, {
        transactionId: payoutForm.transactionId,
        paidDate: payoutForm.paidDate,
        details: payoutForm.details || undefined,
        paymentMethod: payoutForm.paymentMethod,
      });
      // Upload slip if provided (admin record-keeping only)
      if (slipFile) {
        try {
          await uploadPayoutSlip(payout.id, slipFile);
        } catch {
          // Slip upload failure is non-critical
          console.warn('Slip upload failed, payout was still recorded');
        }
      }
      setPayoutSuccess(`Payout of ₹${amountNum.toFixed(2)} to ${payoutModal.tutorName} marked as paid successfully.`);
      loadPayouts(); // Refresh payout records to show new slip/attachment
      setTimeout(() => {
        setPayoutModal(null);
        setPayoutSuccess(null);
        onPayoutComplete?.();
      }, 1500);
    } catch (err: any) {
      setPayoutError(err?.response?.data?.message || 'Failed to process payout');
    } finally {
      setPayoutSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Total Due</p>
          <p className="text-2xl font-bold mt-1">{formatINR(filteredStats.totalDue)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Total Paid</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatINR(filteredStats.totalPaid)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Blocked Tutors</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{filteredStats.blockedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Showing</p>
          <p className="text-2xl font-bold mt-1">{filteredDues.length}<span className="text-sm font-normal text-slate-500">/{dues.length}</span></p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="p-4 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search tutor name or email..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Status</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Fully Paid</option>
          </select>

          {/* Toggle more filters */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              showFilters || monthFilter !== 'all' || commissionFilter !== 'all'
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            More Filters
            {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {/* Clear filters */}
          {(searchName || statusFilter !== 'all' || monthFilter !== 'all' || commissionFilter !== 'all') && (
            <button
              onClick={() => { setSearchName(''); setStatusFilter('all'); setMonthFilter('all'); setCommissionFilter('all'); }}
              className="text-xs text-indigo-600 hover:text-indigo-800 underline"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="px-4 pb-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3">
            <div>
              <label htmlFor="filter-month" className="block text-xs font-medium text-slate-500 mb-1">Month</label>
              <select
                id="filter-month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Months</option>
                {availableMonths.map(m => (
                  <option key={m} value={m}>
                    {new Date(m + '-01').toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-commission" className="block text-xs font-medium text-slate-500 mb-1">Commission Rate</label>
              <select
                id="filter-commission"
                value={commissionFilter}
                onChange={(e) => setCommissionFilter(e.target.value as any)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Rates</option>
                <option value="18">18% (₹700+/hr)</option>
                <option value="22">22% (₹400-699/hr)</option>
                <option value="25">25% (&lt;₹400/hr)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Tutor Payment Details */}
      <div className="space-y-4">
        {filteredDues.map((tutor) => (
          <div
            key={tutor.tutorId}
            className={`rounded-xl border ${
              tutor.isBanned
                ? 'border-rose-200 bg-rose-50'
                : 'border-slate-200 bg-white'
            }`}
          >
            {/* Tutor Header */}
            <button
              onClick={() =>
                setExpandedTutor(expandedTutor === tutor.tutorId ? null : tutor.tutorId)
              }
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-opacity-80 transition-colors"
            >
              <div className="text-left flex-1">
                <h4 className={`font-semibold ${tutor.isBanned ? 'text-rose-900' : 'text-slate-900'}`}>
                  {tutor.tutorName}
                  {tutor.isBanned && (
                    <span className="ml-2 text-xs bg-rose-200 text-rose-700 px-2 py-1 rounded">
                      Banned
                    </span>
                  )}
                  {!tutor.isBanned && (tutor.remaining ?? (tutor.totalDue - tutor.totalPaid)) <= 0 && (
                    <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                      Fully Paid
                    </span>
                  )}
                </h4>
                <p className={`text-sm ${tutor.isBanned ? 'text-rose-700' : 'text-slate-600'}`}>
                  {tutor.tutorEmail}
                </p>
              </div>
              <div className="text-right">
                <p className={`font-semibold text-lg ${tutor.isBanned ? 'text-rose-700' : 'text-slate-900'}`}>
                  {formatINR(tutor.remaining ?? (tutor.totalDue - tutor.totalPaid))}
                </p>
                <p className={`text-xs ${tutor.isBanned ? 'text-rose-600' : 'text-slate-600'}`}>
                  {tutor.commissionRate}% commission
                </p>
                {tutor.totalPaid > 0 && (
                  <p className="text-[10px] text-green-600">Paid: {formatINR(tutor.totalPaid)}</p>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); openPayoutModal(tutor); }}
                disabled={tutor.isBanned || (tutor.totalDue - tutor.totalPaid) <= 0}
                className="ml-3 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                title="Record manual payout"
              >
                <CreditCard className="w-4 h-4" />
                Pay
              </button>
            </button>

            {/* Expanded Schedule + Payout History */}
            {expandedTutor === tutor.tutorId && (
              <div className={`border-t ${tutor.isBanned ? 'border-rose-200' : 'border-slate-200'} px-6 py-4`}>
                {/* Payout History / Attachments */}
                {(() => {
                  const tutorPayouts = getTutorPayouts(tutor.tutorId);
                  if (tutorPayouts.length === 0 && !payoutsLoading) return null;
                  return (
                    <div className="mb-4">
                      <h5 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                        <FileText className="w-4 h-4" />
                        Payout History & Attachments
                      </h5>
                      {payoutsLoading ? (
                        <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                          <Loader2 className="w-3 h-3 animate-spin" /> Loading payouts...
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-600">Amount</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Method</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Txn ID</th>
                                <th className="px-3 py-2 text-center font-semibold text-slate-600">Status</th>
                                <th className="px-3 py-2 text-center font-semibold text-slate-600">Uploaded Slip</th>
                                <th className="px-3 py-2 text-center font-semibold text-slate-600">Receipt</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tutorPayouts.map(p => (
                                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                                  <td className="px-3 py-2 text-slate-700">
                                    {new Date(p.paidAt || p.createdAt).toLocaleDateString('en-IN')}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-slate-900">
                                    {formatINR(Math.round(Number(p.amount) * 100))}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 capitalize">
                                    {(p.paymentMethod || '—').replace('_', ' ')}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-slate-600">
                                    {p.transactionId || '—'}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                      p.status === 'PAID' ? 'bg-green-100 text-green-700' :
                                      p.status === 'CANCELED' ? 'bg-red-100 text-red-700' :
                                      'bg-amber-100 text-amber-700'
                                    }`}>{p.status}</span>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {p.slipUrl ? (
                                      <button
                                        onClick={() => setViewingSlip({ url: p.slipUrl!, tutorName: tutor.tutorName, payoutId: p.id })}
                                        className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium"
                                        title="View uploaded payment slip"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                        View
                                      </button>
                                    ) : (
                                      <span className="text-slate-400 text-[10px]">No slip</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <button
                                      onClick={async () => {
                                        try {
                                          setReceiptLoading(p.id);
                                          const receipt = await getPayoutReceipt(p.id);
                                          setViewingReceipt(receipt);
                                        } catch (err) {
                                          console.error('Failed to load receipt:', err);
                                        } finally {
                                          setReceiptLoading(null);
                                        }
                                      }}
                                      disabled={receiptLoading === p.id}
                                      className="inline-flex items-center gap-1 text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                                      title="View auto-generated receipt"
                                    >
                                      {receiptLoading === p.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Receipt className="w-3.5 h-3.5" />
                                      )}
                                      Receipt
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Payment Schedule */}
                <h5 className="text-sm font-semibold text-slate-700 mb-2">Payment Schedule</h5>
                <div className="space-y-3">
                  {tutor.paymentSchedule.map((schedule, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg p-4 ${
                        schedule.status === 'blocked'
                          ? 'bg-rose-100 border border-rose-200'
                          : schedule.status === 'paid'
                          ? 'bg-green-100 border border-green-200'
                          : 'bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold">
                            Due: {new Date(schedule.dueDate).toLocaleDateString('en-IN')}
                          </p>
                          <p className="text-sm text-slate-600">
                            {schedule.bookingsCount} bookings
                          </p>
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            schedule.status === 'blocked'
                              ? 'bg-rose-200 text-rose-700 font-semibold'
                              : schedule.status === 'paid'
                              ? 'bg-green-200 text-green-700 font-semibold'
                              : 'bg-amber-200 text-amber-700 font-semibold'
                          }`}
                        >
                          {schedule.status.toUpperCase()}
                        </span>
                      </div>

                      {/* Booking Details */}
                      {schedule.bookingId && (
                        <div className="mb-2 p-2 bg-white/60 rounded border border-slate-200 text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 w-20">Booking ID:</span>
                            <span className="font-mono font-semibold text-indigo-700" title={schedule.bookingId}>
                              {schedule.bookingId.slice(-8).toUpperCase()}
                            </span>
                          </div>
                          {schedule.studentName && (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 w-20">Student:</span>
                              <span className="font-medium text-slate-800">{schedule.studentName}</span>
                            </div>
                          )}
                          {schedule.sessionDate && (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 w-20">Session:</span>
                              <span className="text-slate-700">
                                {new Date(schedule.sessionDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                                {schedule.sessionEndDate && (
                                  <> – {new Date(schedule.sessionEndDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</>
                                )}
                              </span>
                            </div>
                          )}
                          {schedule.bookingStatus && (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 w-20">Status:</span>
                              <span className={`font-medium ${
                                schedule.bookingStatus === 'COMPLETED' ? 'text-green-700' :
                                schedule.bookingStatus === 'AUTO_CANCELLED_STUDENT_NO_SHOW' ? 'text-amber-700' :
                                'text-slate-700'
                              }`}>
                                {schedule.bookingStatus.replace(/_/g, ' ')}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Amount</span>
                        <span className="font-semibold">
                          Due: {formatINR(schedule.amountDue)} | Paid: {formatINR(schedule.amountPaid)}
                        </span>
                      </div>
                      {schedule.blockedReason && (
                        <p className="text-xs text-rose-700 mt-2">
                          <span className="font-semibold">Reason:</span> {schedule.blockedReason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && filteredDues.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-12 text-center">
          <p className="text-slate-600">
            {dues.length === 0 ? 'No tutor payment records found' : 'No tutors match the current filters'}
          </p>
          {dues.length > 0 && (
            <button
              onClick={() => { setSearchName(''); setStatusFilter('all'); setMonthFilter('all'); setCommissionFilter('all'); }}
              className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Slip Viewer Modal */}
      {viewingSlip && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Payment Slip</h3>
                <p className="text-sm text-slate-600">{viewingSlip.tutorName}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={viewingSlip.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open
                </a>
                <button onClick={() => setViewingSlip(null)} className="p-1 rounded hover:bg-slate-100">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-50">
              {viewingSlip.url.toLowerCase().includes('.pdf') ? (
                <iframe src={viewingSlip.url} title="Payment Slip Document" className="w-full h-[70vh] rounded border border-slate-200" />
              ) : (
                <img
                  src={viewingSlip.url}
                  alt="Payment Slip"
                  className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.innerHTML =
                      '<p class="text-slate-500 text-sm">Unable to load image. <a href="' + viewingSlip.url + '" target="_blank" class="text-indigo-600 underline">Open in new tab</a></p>';
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auto-Generated Receipt Viewer Modal */}
      {viewingReceipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Payout Receipt</h3>
                <p className="text-xs text-slate-500">Auto-generated receipt sent to tutor</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const r = viewingReceipt;
                    const bankRows = [
                      r.bankInfo?.bankAccountHolder ? `<tr><td style="color:#3b82f6;padding:2px 8px 2px 0;font-size:12px">Holder:</td><td style="font-weight:600;font-size:12px">${r.bankInfo.bankAccountHolder}</td></tr>` : '',
                      r.bankInfo?.bankName ? `<tr><td style="color:#3b82f6;padding:2px 8px 2px 0;font-size:12px">Bank:</td><td style="font-weight:600;font-size:12px">${r.bankInfo.bankName}</td></tr>` : '',
                      r.bankInfo?.accountNumber ? `<tr><td style="color:#3b82f6;padding:2px 8px 2px 0;font-size:12px">A/C:</td><td style="font-family:monospace;font-weight:600;font-size:12px">${r.bankInfo.accountNumber}</td></tr>` : '',
                      r.bankInfo?.ifsc ? `<tr><td style="color:#3b82f6;padding:2px 8px 2px 0;font-size:12px">IFSC:</td><td style="font-family:monospace;font-weight:600;font-size:12px">${r.bankInfo.ifsc}</td></tr>` : '',
                      r.bankInfo?.upiId ? `<tr><td style="color:#3b82f6;padding:2px 8px 2px 0;font-size:12px">UPI:</td><td style="font-family:monospace;font-weight:600;font-size:12px">${r.bankInfo.upiId}</td></tr>` : '',
                    ].filter(Boolean).join('');
                    const statusColor = r.status === 'PAID' ? '#15803d' : r.status === 'CANCELED' ? '#dc2626' : '#d97706';
                    const statusBg = r.status === 'PAID' ? '#dcfce7' : r.status === 'CANCELED' ? '#fef2f2' : '#fef9c3';
                    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${r.receiptId}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:40px;max-width:600px;margin:0 auto;color:#1e293b}
@media print{body{padding:20px}@page{size:A4;margin:20mm}}</style></head><body>
<div style="text-align:center;border-bottom:1px solid #e2e8f0;padding-bottom:16px;margin-bottom:20px">
<h1 style="font-size:20px;font-weight:700">${r.companyName}</h1>
<p style="font-size:12px;color:#64748b;margin-top:4px">Payment Receipt</p>
<p style="font-size:12px;font-family:monospace;color:#4f46e5;margin-top:4px">${r.receiptId}</p></div>
<div style="display:flex;justify-content:space-between;margin-bottom:20px">
<div><p style="font-size:11px;color:#64748b">Paid To</p><p style="font-weight:600;font-size:14px">${r.tutorName}</p><p style="font-size:12px;color:#475569">${r.tutorEmail}</p></div>
<div style="text-align:right"><p style="font-size:11px;color:#64748b">Amount</p><p style="font-size:24px;font-weight:700;color:#16a34a">₹${r.amount.toFixed(2)}</p></div></div>
<div style="background:#f8fafc;border-radius:8px;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
<div><p style="font-size:11px;color:#64748b">Status</p><span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:${statusBg};color:${statusColor}">${r.status}</span></div>
<div><p style="font-size:11px;color:#64748b">Payment Method</p><p style="font-weight:500;font-size:13px;text-transform:capitalize">${(r.paymentMethod || '—').replace('_', ' ')}</p></div>
<div><p style="font-size:11px;color:#64748b">Transaction ID</p><p style="font-family:monospace;font-size:12px">${r.transactionId || '—'}</p></div>
<div><p style="font-size:11px;color:#64748b">Reference</p><p style="font-weight:500;font-size:13px">${r.reference || '—'}</p></div>
<div><p style="font-size:11px;color:#64748b">Created</p><p style="font-weight:500;font-size:13px">${new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
<div><p style="font-size:11px;color:#64748b">Paid At</p><p style="font-weight:500;font-size:13px">${r.paidAt ? new Date(r.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p></div></div>
${r.bankInfo ? `<div style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:8px;padding:12px;margin-bottom:20px">
<p style="font-size:12px;font-weight:600;color:#1e40af;margin-bottom:8px">🏦 Bank Details</p>
<table>${bankRows}</table></div>` : ''}
${r.details ? `<div style="margin-bottom:20px"><p style="font-size:11px;color:#64748b;margin-bottom:4px">Notes</p><p style="font-size:13px;background:#f8fafc;border-radius:8px;padding:12px">${r.details}</p></div>` : ''}
<div style="text-align:center;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:20px">
<p style="font-size:10px;color:#94a3b8">Generated on ${new Date(r.generatedAt).toLocaleString('en-IN')}</p>
<p style="font-size:10px;color:#94a3b8">${r.companyName} • Payout ID: ${r.payoutId}</p></div>
</body></html>`;
                    const printWindow = window.open('', '_blank', 'width=700,height=900');
                    if (printWindow) {
                      printWindow.document.write(html);
                      printWindow.document.close();
                      printWindow.onload = () => { printWindow.print(); };
                    }
                  }}
                  className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800 font-medium"
                  title="Print receipt"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button onClick={() => setViewingReceipt(null)} className="p-1 rounded hover:bg-slate-100">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {/* Receipt Card */}
              <div className="border border-slate-200 rounded-xl p-6 space-y-5">
                {/* Header */}
                <div className="text-center border-b border-slate-100 pb-4">
                  <h4 className="text-xl font-bold text-slate-900">{viewingReceipt.companyName}</h4>
                  <p className="text-xs text-slate-500 mt-1">Payment Receipt</p>
                  <p className="text-xs font-mono text-indigo-600 mt-1">{viewingReceipt.receiptId}</p>
                </div>

                {/* Tutor & Payment Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Paid To</p>
                    <p className="font-semibold text-slate-900">{viewingReceipt.tutorName}</p>
                    <p className="text-xs text-slate-600">{viewingReceipt.tutorEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 mb-0.5">Amount</p>
                    <p className="text-2xl font-bold text-green-600">₹{viewingReceipt.amount.toFixed(2)}</p>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Status</p>
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5 ${
                      viewingReceipt.status === 'PAID' ? 'bg-green-100 text-green-700' :
                      viewingReceipt.status === 'CANCELED' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{viewingReceipt.status}</span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Payment Method</p>
                    <p className="font-medium text-slate-900 capitalize mt-0.5">{(viewingReceipt.paymentMethod || '—').replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Transaction ID</p>
                    <p className="font-mono text-slate-900 mt-0.5 text-xs">{viewingReceipt.transactionId || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Reference</p>
                    <p className="font-medium text-slate-900 mt-0.5">{viewingReceipt.reference || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Created</p>
                    <p className="font-medium text-slate-900 mt-0.5">{new Date(viewingReceipt.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Paid At</p>
                    <p className="font-medium text-slate-900 mt-0.5">{viewingReceipt.paidAt ? new Date(viewingReceipt.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
                  </div>
                </div>

                {/* Bank Info */}
                {viewingReceipt.bankInfo && (
                  <div className="border border-blue-200 bg-blue-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> Bank Details</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-900">
                      {viewingReceipt.bankInfo.bankAccountHolder && (<><span className="text-blue-600">Holder:</span><span className="font-medium">{viewingReceipt.bankInfo.bankAccountHolder}</span></>)}
                      {viewingReceipt.bankInfo.bankName && (<><span className="text-blue-600">Bank:</span><span className="font-medium">{viewingReceipt.bankInfo.bankName}</span></>)}
                      {viewingReceipt.bankInfo.accountNumber && (<><span className="text-blue-600">A/C:</span><span className="font-mono font-medium">{viewingReceipt.bankInfo.accountNumber}</span></>)}
                      {viewingReceipt.bankInfo.ifsc && (<><span className="text-blue-600">IFSC:</span><span className="font-mono font-medium">{viewingReceipt.bankInfo.ifsc}</span></>)}
                      {viewingReceipt.bankInfo.upiId && (<><span className="text-blue-600">UPI:</span><span className="font-mono font-medium">{viewingReceipt.bankInfo.upiId}</span></>)}
                    </div>
                  </div>
                )}

                {/* Details / Notes */}
                {viewingReceipt.details && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Notes</p>
                    <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{viewingReceipt.details}</p>
                  </div>
                )}

                {/* Attached Slip */}
                {viewingReceipt.slipUrl && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Attached Payment Slip</p>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      {viewingReceipt.slipUrl.toLowerCase().includes('.pdf') ? (
                        <a href={viewingReceipt.slipUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 p-3 text-sm text-indigo-600 hover:bg-indigo-50">
                          <FileText className="w-4 h-4" /> Open PDF Slip
                          <ExternalLink className="w-3 h-3 ml-auto" />
                        </a>
                      ) : (
                        <img
                          src={viewingReceipt.slipUrl}
                          alt="Payment Slip"
                          className="w-full max-h-48 object-contain bg-slate-50"
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="text-center border-t border-slate-100 pt-3">
                  <p className="text-[10px] text-slate-400">Generated on {new Date(viewingReceipt.generatedAt).toLocaleString('en-IN')}</p>
                  <p className="text-[10px] text-slate-400">{viewingReceipt.companyName} • Payout ID: {viewingReceipt.payoutId}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Payout Modal */}
      {payoutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Record Manual Payout</h3>
              <button onClick={() => setPayoutModal(null)} className="p-1 rounded hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-2">
              Tutor: <strong>{payoutModal.tutorName}</strong>
              <br />
              Outstanding: <strong>{formatINR(payoutModal.maxAmount)}</strong>
            </p>

            {/* Bank / UPI Details */}
            {payoutModal.bankInfo && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-800 mb-2">
                  <Building2 className="w-4 h-4" />
                  Payment Details
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-900">
                  {payoutModal.bankInfo.bankAccountHolder && (
                    <>
                      <span className="text-blue-600">Account Holder:</span>
                      <span className="font-medium">{payoutModal.bankInfo.bankAccountHolder}</span>
                    </>
                  )}
                  {payoutModal.bankInfo.bankName && (
                    <>
                      <span className="text-blue-600">Bank:</span>
                      <span className="font-medium">{payoutModal.bankInfo.bankName}</span>
                    </>
                  )}
                  {payoutModal.bankInfo.accountNumber && (
                    <>
                      <span className="text-blue-600">Account No:</span>
                      <span className="font-mono font-medium">{payoutModal.bankInfo.accountNumber}</span>
                    </>
                  )}
                  {payoutModal.bankInfo.ifsc && (
                    <>
                      <span className="text-blue-600">IFSC:</span>
                      <span className="font-mono font-medium">{payoutModal.bankInfo.ifsc}</span>
                    </>
                  )}
                  {payoutModal.bankInfo.upiId && (
                    <>
                      <span className="text-blue-600">UPI ID:</span>
                      <span className="font-mono font-medium">{payoutModal.bankInfo.upiId}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {payoutError && (
              <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                {payoutError}
              </div>
            )}
            {payoutSuccess && (
              <div className="mb-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">
                {payoutSuccess}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={payoutForm.amount}
                  onChange={(e) => setPayoutForm({ ...payoutForm, amount: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                <select
                  value={payoutForm.paymentMethod}
                  onChange={(e) => setPayoutForm({ ...payoutForm, paymentMethod: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
                >
                  <option value="razorpay">Razorpay</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="upi">UPI</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Transaction ID *</label>
                <input
                  type="text"
                  value={payoutForm.transactionId}
                  onChange={(e) => setPayoutForm({ ...payoutForm, transactionId: e.target.value })}
                  placeholder="e.g., pay_xxxxx or UTR number"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payout Date</label>
                <input
                  type="date"
                  value={payoutForm.paidDate}
                  onChange={(e) => setPayoutForm({ ...payoutForm, paidDate: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reference / Notes</label>
                <input
                  type="text"
                  value={payoutForm.reference}
                  onChange={(e) => setPayoutForm({ ...payoutForm, reference: e.target.value })}
                  placeholder="Optional reference"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Details</label>
                <textarea
                  value={payoutForm.details}
                  onChange={(e) => setPayoutForm({ ...payoutForm, details: e.target.value })}
                  placeholder="Optional additional details"
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payment Slip (optional, admin record only)</label>
                <input
                  ref={slipInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setSlipFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => slipInputRef.current?.click()}
                  className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-green-400 hover:text-green-700 transition flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {slipFile ? slipFile.name : 'Upload payment slip'}
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setPayoutModal(null)}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handlePayoutSubmit}
                disabled={payoutSubmitting}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition"
              >
                {payoutSubmitting ? 'Processing...' : 'Mark as Paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
