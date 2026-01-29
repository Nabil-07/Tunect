import { useEffect, useState, useMemo } from 'react';
import { Download, Eye, Loader2, AlertCircle, TrendingUp, Users } from 'lucide-react';
import { getStudentPayments, getTutorPaymentsDue } from '../../../services/financeService';
import type { StudentPayment, TutorPaymentDue } from '../../../services/financeService';

export default function PaymentsPage() {
  const [tab, setTab] = useState<'received' | 'due'>('received');
  const [studentPayments, setStudentPayments] = useState<StudentPayment[]>([]);
  const [tutorDues, setTutorDues] = useState<TutorPaymentDue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
      totalDue: tutorDues.reduce((sum, t) => sum + t.totalDue, 0),
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
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 flex gap-3">
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
        <TutorDuesTab dues={tutorDues} stats={tutorStats} loading={loading} formatINR={formatINR} />
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
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Tutor</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
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
                    <td className="px-4 py-3 text-slate-700">{payment.tutorName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatINR(payment.amount)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(payment.paidAt).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          title="View Details"
                          className="p-1 rounded hover:bg-slate-200 transition-colors"
                        >
                          <Eye className="w-4 h-4 text-slate-600" />
                        </button>
                        {payment.receiptUrl && (
                          <a
                            href={payment.receiptUrl}
                            download
                            title="Download Receipt"
                            className="p-1 rounded hover:bg-slate-200 transition-colors"
                          >
                            <Download className="w-4 h-4 text-slate-600" />
                          </a>
                        )}
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
                  <th className="px-4 py-3 text-left font-semibold text-rose-900">Tutor</th>
                  <th className="px-4 py-3 text-right font-semibold text-rose-900">Amount</th>
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
                    <td className="px-4 py-3 text-rose-700">{payment.tutorName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-900">{formatINR(payment.amount)}</td>
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
    </div>
  );
}

function TutorDuesTab({
  dues,
  stats,
  loading,
  formatINR,
}: {
  dues: TutorPaymentDue[];
  stats: { totalDue: number; totalPaid: number; blockedCount: number };
  loading: boolean;
  formatINR: (paise: number) => string;
}) {
  const [expandedTutor, setExpandedTutor] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Total Due</p>
          <p className="text-2xl font-bold mt-1">{formatINR(stats.totalDue)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Total Paid</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatINR(stats.totalPaid)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Blocked Tutors</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{stats.blockedCount}</p>
        </div>
      </div>

      {/* Tutor Payment Details */}
      <div className="space-y-4">
        {dues.map((tutor) => (
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
                </h4>
                <p className={`text-sm ${tutor.isBanned ? 'text-rose-700' : 'text-slate-600'}`}>
                  {tutor.tutorEmail}
                </p>
              </div>
              <div className="text-right">
                <p className={`font-semibold text-lg ${tutor.isBanned ? 'text-rose-700' : 'text-slate-900'}`}>
                  {formatINR(tutor.totalDue)}
                </p>
                <p className={`text-xs ${tutor.isBanned ? 'text-rose-600' : 'text-slate-600'}`}>
                  {tutor.commissionRate}% commission
                </p>
              </div>
            </button>

            {/* Expanded Schedule */}
            {expandedTutor === tutor.tutorId && (
              <div className={`border-t ${tutor.isBanned ? 'border-rose-200' : 'border-slate-200'} px-6 py-4`}>
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

      {!loading && dues.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-12 text-center">
          <p className="text-slate-600">No tutor payment records found</p>
        </div>
      )}
    </div>
  );
}
