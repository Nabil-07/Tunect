import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, DollarSign, BookOpen, Award, MessageSquare, ShoppingCart, Clock, ArrowLeftRight, Loader2 } from 'lucide-react';
import { fetchStudentDetail } from '../../services/adminService';
import { http } from '../../api/http';

interface StudentDetail {
  id: string;
  grade: string | null;
  tokens: number;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    updatedAt: string;
    isBanned: boolean;
    bannedScope: string | null;
    bannedAt: string | null;
  };
  bookings: Array<{
    id: string;
    startTime: string | null;
    endTime: string | null;
    status: string;
    isDemo: boolean;
    createdAt: string;
    tutor: {
      id: string;
      user: {
        name: string | null;
        email: string;
      };
    };
    review: {
      rating: number;
      comment: string | null;
      createdAt: string;
    } | null;
  }>;
  tutorTokenBalances: Array<{
    id: string;
    balance: number;
    expiresAt: string | null;
    daysUntilExpiry: number | null;
    tutor: {
      id: string;
      user: {
        name: string | null;
        email: string;
      };
    };
  }>;
  tokenLedger: Array<{
    id: string;
    delta: number;
    reason: string;
    createdAt: string;
    tutor: {
      user: {
        name: string | null;
      };
    } | null;
  }>;
  tokenTransferRequests: Array<{
    id: string;
    tokenAmount: number;
    status: string;
    reason: string | null;
    createdAt: string;
    fromTutor: {
      user: { name: string | null };
    };
    toTutor: {
      user: { name: string | null };
    };
    admin: {
      email: string;
    } | null;
  }>;
  refundRequests: Array<{
    id: string;
    tokenAmount: number;
    status: string;
    reason: string | null;
    createdAt: string;
    tutor: {
      user: { name: string | null };
    };
    admin: {
      email: string;
    } | null;
  }>;
  assignments: Array<{
    id: string;
    title: string;
    status: string;
    createdAt: string;
    tutor: {
      user: { name: string | null };
    };
  }>;
  certificates: Array<{
    id: string;
    type: string;
    hours: number;
    createdAt: string;
    tutor: {
      user: { name: string | null };
    } | null;
  }>;
  progress: Array<{
    id: string;
    subject: string;
    level: string | null;
    updatedAt: string;
  }>;
  payments?: Array<{
    id: string;
    amountInMinor: number;
    currency: string;
    tokensPurchased: number;
    status: string;
    provider: string;
    providerOrderId: string | null;
    createdAt: string;
  }>;
  conversations?: Array<{
    id: string;
    createdAt: string;
    tutor: {
      id: string;
      user: {
        id: string;
        email: string;
        name: string | null;
      };
    };
    messages: Array<{
      id: string;
      text: string;
      createdAt: string;
      user: {
        id: string;
        email: string;
        name: string | null;
      };
    }>;
  }>;
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [switchingRole, setSwitchingRole] = useState(false);

  useEffect(() => {
    const loadStudent = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchStudentDetail(id!);
        setStudent(data);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load student details');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadStudent();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error || 'Student not found'}</p>
          <Link to="/admin/students" className="text-blue-600 hover:underline mt-2 inline-block">
            ← Back to Students
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        to="/admin/students"
        className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Students
      </Link>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {student.user.name || student.user.email}
        </h1>
        <p className="text-slate-600 mb-4">{student.user.email}</p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <DollarSign className="w-5 h-5 text-blue-600 mr-2" />
              <span className="text-sm font-medium text-slate-700">Total Tokens</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{student.tokens}</p>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <BookOpen className="w-5 h-5 text-green-600 mr-2" />
              <span className="text-sm font-medium text-slate-700">Total Bookings</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{student.bookings.length}</p>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <Award className="w-5 h-5 text-purple-600 mr-2" />
              <span className="text-sm font-medium text-slate-700">Certificates</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">{student.certificates.length}</p>
          </div>

          <div className="bg-orange-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <Calendar className="w-5 h-5 text-orange-600 mr-2" />
              <span className="text-sm font-medium text-slate-700">Member Since</span>
            </div>
            <p className="text-sm font-bold text-orange-600">
              {new Date(student.user.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center mb-1">
              <Clock className="w-4 h-4 text-slate-600 mr-2" />
              <span className="text-xs font-medium text-slate-700">Last Active</span>
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {student.user.updatedAt ? new Date(student.user.updatedAt).toLocaleString() : 'Never'}
            </p>
          </div>
          {student.payments && (
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="flex items-center mb-1">
                <ShoppingCart className="w-4 h-4 text-slate-600 mr-2" />
                <span className="text-xs font-medium text-slate-700">Total Purchases</span>
              </div>
              <p className="text-sm font-semibold text-slate-900">{student.payments.length}</p>
            </div>
          )}
          {student.conversations && (
            <div
              className="bg-slate-50 rounded-lg p-3 cursor-pointer hover:bg-blue-50 transition-colors"
              onClick={() => document.getElementById('conversations-section')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <div className="flex items-center mb-1">
                <MessageSquare className="w-4 h-4 text-slate-600 mr-2" />
                <span className="text-xs font-medium text-slate-700">Conversations</span>
              </div>
              <p className="text-sm font-semibold text-blue-600 underline">{student.conversations.length}</p>
            </div>
          )}
        </div>

        {student.user.isBanned && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-red-800 font-medium">🚫 Account Blocked</p>
            <p className="text-sm text-red-600">
              Scope: {student.user.bannedScope || 'ALL'} | Banned: {student.user.bannedAt ? new Date(student.user.bannedAt).toLocaleDateString() : 'Unknown'}
            </p>
          </div>
        )}

        {/* Admin: Switch Role */}
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-amber-800 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4" /> Switch Role
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Convert this student account to a tutor account. All data is preserved.
              </p>
            </div>
            <button
              onClick={async () => {
                if (!confirm('Switch this user from Student to Tutor? Their student profile will be preserved.')) return;
                setSwitchingRole(true);
                try {
                  await http.post(`/profiles/switch-role/${student.user.id}`);
                  alert('Role switched to Tutor successfully. Reloading...');
                  window.location.reload();
                } catch (err: any) {
                  alert(err.response?.data?.message || 'Failed to switch role');
                } finally {
                  setSwitchingRole(false);
                }
              }}
              disabled={switchingRole}
              className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors text-sm"
            >
              {switchingRole ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
              {switchingRole ? 'Switching...' : 'Switch to Tutor'}
            </button>
          </div>
        </div>
      </div>

      {/* Token Balances by Tutor */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Token Balances by Tutor</h2>
        {student.tutorTokenBalances.length === 0 ? (
          <p className="text-slate-500">No token balances</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Tutor</th>
                  <th className="text-right py-2 px-4">Balance</th>
                  <th className="text-left py-2 px-4">Expiration</th>
                </tr>
              </thead>
              <tbody>
                {student.tutorTokenBalances.map((balance) => {
                  const isExpired = balance.daysUntilExpiry !== null && balance.daysUntilExpiry < 0;
                  const isExpiring = balance.daysUntilExpiry !== null && balance.daysUntilExpiry < 7;
                  
                  return (
                    <tr 
                      key={balance.id} 
                      className={`border-b ${isExpired ? 'bg-red-50' : isExpiring ? 'bg-amber-50' : ''}`}
                    >
                      <td className="py-2 px-4">
                        {balance.tutor.user.name || balance.tutor.user.email}
                      </td>
                      <td className="text-right py-2 px-4 font-semibold">
                        {Number(balance.balance).toFixed(2)} tokens
                      </td>
                      <td className="py-2 px-4">
                        {balance.daysUntilExpiry !== null ? (
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            isExpired 
                              ? 'bg-red-100 text-red-700' 
                              : isExpiring 
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {isExpired ? '❌ Expired' : `⏰ ${balance.daysUntilExpiry} days`}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-sm">No expiry</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Booking History */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Booking History</h2>
        {student.bookings.length === 0 ? (
          <p className="text-slate-500">No bookings</p>
        ) : (
          <div className="space-y-3">
            {student.bookings.map((booking) => (
              <div key={booking.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">
                      {booking.tutor.user.name || booking.tutor.user.email}
                    </p>
                    <p className="text-sm text-slate-600">
                      {booking.startTime && booking.endTime
                        ? `${new Date(booking.startTime).toLocaleString()} - ${new Date(booking.endTime).toLocaleString()}`
                        : 'Time TBD'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Status: {booking.status} {booking.isDemo && '| Demo'}
                    </p>
                    {booking.review && (
                      <p className="text-sm text-yellow-600 mt-2">
                        ⭐ {booking.review.rating}/5 - {booking.review.comment}
                      </p>
                    )}
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    booking.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                    booking.status === 'CONFIRMED' ? 'bg-blue-100 text-blue-800' :
                    'bg-slate-100 text-slate-800'
                  }`}>
                    {booking.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transfer Requests */}
      {student.tokenTransferRequests.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Token Transfer Requests</h2>
          <div className="space-y-3">
            {student.tokenTransferRequests.map((req) => (
              <div key={req.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">
                      {req.fromTutor.user.name} → {req.toTutor.user.name}
                    </p>
                    <p className="text-sm text-slate-600">
                      Amount: {Number(req.tokenAmount).toFixed(2)} tokens
                    </p>
                    {req.reason && <p className="text-sm text-slate-500 mt-1">Reason: {req.reason}</p>}
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(req.createdAt).toLocaleString()}
                      {req.admin && ` | Processed by: ${req.admin.email}`}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    req.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    req.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {req.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refund Requests */}
      {student.refundRequests.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Refund Requests</h2>
          <div className="space-y-3">
            {student.refundRequests.map((req) => (
              <div key={req.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">
                      Refund from {req.tutor.user.name}
                    </p>
                    <p className="text-sm text-slate-600">
                      Amount: {Number(req.tokenAmount).toFixed(2)} tokens
                    </p>
                    {req.reason && <p className="text-sm text-slate-500 mt-1">Reason: {req.reason}</p>}
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(req.createdAt).toLocaleString()}
                      {req.admin && ` | Processed by: ${req.admin.email}`}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    req.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    req.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {req.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Token Transaction History */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Token Transaction History</h2>
        {student.tokenLedger.length === 0 ? (
          <p className="text-slate-500">No transactions</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Date</th>
                  <th className="text-left py-2 px-4">Tutor</th>
                  <th className="text-left py-2 px-4">Reason</th>
                  <th className="text-right py-2 px-4">Amount</th>
                </tr>
              </thead>
              <tbody>
                {student.tokenLedger.map((entry) => (
                  <tr key={entry.id} className="border-b">
                    <td className="py-2 px-4 text-sm">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 px-4 text-sm">
                      {entry.tutor?.user.name || 'N/A'}
                    </td>
                    <td className="py-2 px-4 text-sm">{entry.reason}</td>
                    <td className={`text-right py-2 px-4 font-semibold ${
                      Number(entry.delta) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {Number(entry.delta) >= 0 ? '+' : ''}{Number(entry.delta).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assignments */}
      {student.assignments.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Assignments</h2>
          <div className="space-y-2">
            {student.assignments.map((assignment) => (
              <div key={assignment.id} className="border rounded-lg p-3">
                <p className="font-semibold">{assignment.title}</p>
                <p className="text-sm text-slate-600">
                  Tutor: {assignment.tutor.user.name} | Status: {assignment.status}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(assignment.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      {student.progress.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Learning Progress</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {student.progress.map((prog) => (
              <div key={prog.id} className="border rounded-lg p-4">
                <p className="font-semibold">{prog.subject}</p>
                <p className="text-sm text-slate-600">Level: {prog.level || 'N/A'}</p>
                <p className="text-xs text-slate-500">
                  Updated: {new Date(prog.updatedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Purchase History */}
      {student.payments && student.payments.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Purchase History</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Date</th>
                  <th className="text-left py-2 px-4">Amount</th>
                  <th className="text-left py-2 px-4">Tokens</th>
                  <th className="text-left py-2 px-4">Provider</th>
                  <th className="text-left py-2 px-4">Status</th>
                  <th className="text-left py-2 px-4">Order ID</th>
                </tr>
              </thead>
              <tbody>
                {student.payments.map((payment) => (
                  <tr key={payment.id} className="border-b">
                    <td className="py-2 px-4 text-sm">
                      {new Date(payment.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 px-4 text-sm font-semibold">
                      {payment.currency} {(payment.amountInMinor / 100).toFixed(2)}
                    </td>
                    <td className="py-2 px-4 text-sm">{payment.tokensPurchased}</td>
                    <td className="py-2 px-4 text-sm">{payment.provider}</td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        payment.status === 'SUCCEEDED' ? 'bg-green-100 text-green-800' :
                        payment.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-sm text-slate-500">
                      {payment.providerOrderId || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Messages/Conversations */}
      {student.conversations && student.conversations.length > 0 && (
        <div id="conversations-section" className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Messages & Conversations</h2>
          <div className="flex gap-4" style={{ minHeight: 400 }}>
            {/* Conversation list (left panel) */}
            <div className="w-1/3 border-r border-slate-200 pr-4 overflow-y-auto" style={{ maxHeight: 500 }}>
              {student.conversations.map((conv) => {
                const lastMsg = conv.messages[0];
                const isSelected = selectedConvId === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full text-left p-3 rounded-lg mb-2 transition-colors ${
                      isSelected ? 'bg-blue-50 border border-blue-300' : 'bg-slate-50 hover:bg-slate-100 border border-transparent'
                    }`}
                  >
                    <p className="font-semibold text-sm text-slate-900 truncate">
                      {conv.tutor.user.name || conv.tutor.user.email}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {conv.messages.length} message{conv.messages.length !== 1 ? 's' : ''}
                    </p>
                    {lastMsg && (
                      <p className="text-xs text-slate-400 mt-1 truncate">
                        {lastMsg.text.slice(0, 60)}{lastMsg.text.length > 60 ? '…' : ''}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Chat view (right panel) */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {(() => {
                const selectedConv = student.conversations?.find(c => c.id === selectedConvId);
                if (!selectedConv) {
                  return (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                      <div className="text-center">
                        <MessageSquare className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        <p>Select a conversation to view messages</p>
                      </div>
                    </div>
                  );
                }
                return (
                  <>
                    <div className="border-b border-slate-200 pb-3 mb-3">
                      <p className="font-semibold text-slate-900">
                        {selectedConv.tutor.user.name || selectedConv.tutor.user.email}
                      </p>
                      <p className="text-xs text-slate-500">
                        Started: {new Date(selectedConv.createdAt).toLocaleString()} · {selectedConv.messages.length} messages
                      </p>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-2" style={{ maxHeight: 400 }}>
                      {selectedConv.messages.slice().reverse().map((msg) => {
                        const isStudent = msg.user.id === student.user.id;
                        return (
                          <div key={msg.id} className={`flex ${isStudent ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] rounded-xl px-3 py-2 ${
                              isStudent ? 'bg-blue-100 text-blue-900' : 'bg-slate-100 text-slate-800'
                            }`}>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-semibold">
                                  {isStudent ? '📚 ' : '🎓 '}{msg.user.name || msg.user.email}
                                </span>
                              </div>
                              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                              <p className="text-[10px] text-slate-400 mt-1 text-right">
                                {new Date(msg.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
