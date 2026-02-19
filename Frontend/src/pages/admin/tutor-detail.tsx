import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, DollarSign, BookOpen, Award, MessageSquare, Clock } from 'lucide-react';
import { fetchTutorDetail } from '../../services/adminService';

interface TutorDetail {
  id: string;
  bio: string | null;
  hourlyRate: number | null;
  status: string;
  subjects: string[];
  createdAt: string;
  lastActiveDate: string | null;
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
    student: {
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
  wallet: {
    balance: number;
    updatedAt: string;
  } | null;
  walletLedger: Array<{
    id: string;
    delta: number;
    reason: string;
    createdAt: string;
    bookingId: string | null;
  }>;
  payouts: Array<{
    id: string;
    amount: number;
    status: string;
    reference: string | null;
    createdAt: string;
  }>;
  reviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    booking: {
      student: {
        user: {
          email: string;
          name: string | null;
        };
      };
    };
  }>;
  assignments: Array<{
    id: string;
    title: string;
    status: string;
    createdAt: string;
    student: {
      user: {
        email: string;
        name: string | null;
      };
    };
  }>;
  kycDocs: Array<{
    id: string;
    docType: string;
    url: string;
    status: string;
    notes: string | null;
    createdAt: string;
  }>;
  kycApplications: Array<{
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  conversations?: Array<{
    id: string;
    createdAt: string;
    student: {
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

export default function TutorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tutor, setTutor] = useState<TutorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTutor = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchTutorDetail(id!);
        setTutor(data);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load tutor details');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadTutor();
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

  if (error || !tutor) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error || 'Tutor not found'}</p>
          <Link to="/admin/tutors" className="text-blue-600 hover:underline mt-2 inline-block">
            ← Back to Tutors
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        to="/admin/tutors"
        className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Tutors
      </Link>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {tutor.user.name || tutor.user.email}
        </h1>
        <p className="text-slate-600 mb-4">{tutor.user.email}</p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <DollarSign className="w-5 h-5 text-blue-600 mr-2" />
              <span className="text-sm font-medium text-slate-700">Wallet Balance</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">
              ₹{tutor.wallet ? Number(tutor.wallet.balance).toFixed(2) : '0.00'}
            </p>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <BookOpen className="w-5 h-5 text-green-600 mr-2" />
              <span className="text-sm font-medium text-slate-700">Total Bookings</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{tutor.bookings.length}</p>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <Award className="w-5 h-5 text-purple-600 mr-2" />
              <span className="text-sm font-medium text-slate-700">Reviews</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">{tutor.reviews.length}</p>
          </div>

          <div className="bg-orange-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <Calendar className="w-5 h-5 text-orange-600 mr-2" />
              <span className="text-sm font-medium text-slate-700">Member Since</span>
            </div>
            <p className="text-sm font-bold text-orange-600">
              {new Date(tutor.user.createdAt).toLocaleDateString()}
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
              {tutor.lastActiveDate ? new Date(tutor.lastActiveDate).toLocaleString() : 
               tutor.user.updatedAt ? new Date(tutor.user.updatedAt).toLocaleString() : 'Never'}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center mb-1">
              <DollarSign className="w-4 h-4 text-slate-600 mr-2" />
              <span className="text-xs font-medium text-slate-700">Hourly Rate</span>
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {tutor.hourlyRate ? `₹${tutor.hourlyRate}` : 'Not set'}
            </p>
          </div>
          {tutor.conversations && (
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="flex items-center mb-1">
                <MessageSquare className="w-4 h-4 text-slate-600 mr-2" />
                <span className="text-xs font-medium text-slate-700">Conversations</span>
              </div>
              <p className="text-sm font-semibold text-slate-900">{tutor.conversations.length}</p>
            </div>
          )}
        </div>

        {tutor.user.isBanned && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-red-800 font-medium">🚫 Account Blocked</p>
            <p className="text-sm text-red-600">
              Scope: {tutor.user.bannedScope || 'ALL'} | Banned: {tutor.user.bannedAt ? new Date(tutor.user.bannedAt).toLocaleDateString() : 'Unknown'}
            </p>
          </div>
        )}

        {tutor.bio && (
          <div className="mt-4 bg-slate-50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-900 mb-2">Bio</h3>
            <p className="text-slate-700">{tutor.bio}</p>
          </div>
        )}

        {tutor.subjects && tutor.subjects.length > 0 && (
          <div className="mt-4 bg-slate-50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-900 mb-2">Subjects</h3>
            <div className="flex flex-wrap gap-2">
              {tutor.subjects.map((subject, idx) => (
                <span key={idx} className="px-3 py-1 bg-white rounded-full text-sm text-slate-700 border border-slate-200">
                  {subject}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Booking History */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Booking History</h2>
        {tutor.bookings.length === 0 ? (
          <p className="text-slate-500">No bookings</p>
        ) : (
          <div className="space-y-3">
            {tutor.bookings.map((booking) => (
              <div key={booking.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">
                      {booking.student.user.name || booking.student.user.email}
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

      {/* Wallet Ledger */}
      {tutor.walletLedger.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Earnings History</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Date</th>
                  <th className="text-left py-2 px-4">Reason</th>
                  <th className="text-right py-2 px-4">Amount</th>
                </tr>
              </thead>
              <tbody>
                {tutor.walletLedger.map((entry) => (
                  <tr key={entry.id} className="border-b">
                    <td className="py-2 px-4 text-sm">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 px-4 text-sm">{entry.reason}</td>
                    <td className={`text-right py-2 px-4 font-semibold ${
                      Number(entry.delta) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {Number(entry.delta) >= 0 ? '+' : ''}₹{Number(entry.delta).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payouts */}
      {tutor.payouts.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Payouts</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Date</th>
                  <th className="text-right py-2 px-4">Amount</th>
                  <th className="text-left py-2 px-4">Status</th>
                  <th className="text-left py-2 px-4">Reference</th>
                </tr>
              </thead>
              <tbody>
                {tutor.payouts.map((payout) => (
                  <tr key={payout.id} className="border-b">
                    <td className="py-2 px-4 text-sm">
                      {new Date(payout.createdAt).toLocaleString()}
                    </td>
                    <td className="text-right py-2 px-4 font-semibold">
                      ₹{Number(payout.amount).toFixed(2)}
                    </td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        payout.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                        payout.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {payout.status}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-sm text-slate-500">
                      {payout.reference || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reviews */}
      {tutor.reviews.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Reviews</h2>
          <div className="space-y-3">
            {tutor.reviews.map((review) => (
              <div key={review.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">
                      {review.booking.student.user.name || review.booking.student.user.email}
                    </p>
                    <p className="text-sm text-yellow-600 mt-1">
                      ⭐ {review.rating}/5
                    </p>
                    {review.comment && (
                      <p className="text-sm text-slate-700 mt-2">{review.comment}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      {new Date(review.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assignments */}
      {tutor.assignments.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Assignments</h2>
          <div className="space-y-2">
            {tutor.assignments.map((assignment) => (
              <div key={assignment.id} className="border rounded-lg p-3">
                <p className="font-semibold">{assignment.title}</p>
                <p className="text-sm text-slate-600">
                  Student: {assignment.student.user.name || assignment.student.user.email} | Status: {assignment.status}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(assignment.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KYC Documents */}
      {tutor.kycDocs.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-bold text-slate-900">KYC Documents</h2>
            <Link
              to={`/admin/kyc-verification?tutorId=${encodeURIComponent(tutor.id)}`}
              className="text-sm text-blue-600 hover:underline"
            >
              Open full KYC review
            </Link>
          </div>
          <div className="space-y-2">
            {tutor.kycDocs.map((doc) => (
              <div key={doc.id} className="border rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <Link
                      to={`/admin/kyc-verification?tutorId=${encodeURIComponent(tutor.id)}&docId=${encodeURIComponent(doc.id)}`}
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      {doc.docType}
                    </Link>
                    <p className="text-sm text-slate-600">
                      Status: {doc.status}
                    </p>
                    {doc.notes && (
                      <p className="text-sm text-slate-500 mt-1">Notes: {doc.notes}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-sm">
                    <Link
                      to={`/admin/kyc-verification?tutorId=${encodeURIComponent(tutor.id)}&docId=${encodeURIComponent(doc.id)}`}
                      className="text-blue-700 hover:underline"
                    >
                      Review in KYC panel
                    </Link>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      View Document
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages/Conversations */}
      {tutor.conversations && tutor.conversations.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Messages & Conversations</h2>
          <div className="space-y-4">
            {tutor.conversations.map((conv) => (
              <div key={conv.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-semibold">
                      Conversation with {conv.student.user.name || conv.student.user.email}
                    </p>
                    <p className="text-xs text-slate-500">
                      Started: {new Date(conv.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {conv.messages.length} message{conv.messages.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {conv.messages.slice().reverse().map((msg) => (
                    <div key={msg.id} className="bg-slate-50 rounded p-2">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-semibold text-slate-700">
                          {msg.user.name || msg.user.email}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800">{msg.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
