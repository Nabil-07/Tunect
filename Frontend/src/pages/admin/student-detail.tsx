import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, DollarSign, BookOpen, Award, MessageSquare, ShoppingCart, Clock, Trash2, Loader2, FileText, AlertCircle, ShieldCheck, ShieldX, RotateCcw } from 'lucide-react';
import { fetchStudentDetail } from '../../services/adminService';
import { http } from '../../api/http';
import api from '../../lib/apiClient';

interface StudentDetail {
  id: string;
  grade: string | null;
  board?: string | null;
  bio?: string | null;
  timezone?: string | null;
  preferredLanguage?: string | null;
  marksheetUrl?: string | null;
  tokens: number;
  createdAt: string;
  profileCompletion?: number;
  missingFields?: string[];
  profileStatus?: string;
  adminProfileNotes?: string | null;
  resubmissionFields?: string[];
  user: {
    id: string;
    email: string;
    name: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
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

function getStatusBackground(status?: string): string {
  switch (status) {
    case 'APPROVED': return '#f0fdf4';
    case 'REJECTED': return '#fef2f2';
    case 'RESUBMISSION_REQUESTED': return '#fffbeb';
    default: return '#eff6ff';
  }
}

function getStatusBorderColor(status?: string): string {
  switch (status) {
    case 'APPROVED': return '#bbf7d0';
    case 'REJECTED': return '#fecaca';
    case 'RESUBMISSION_REQUESTED': return '#fde68a';
    default: return '#bfdbfe';
  }
}

function getStatusTextColor(status?: string): string {
  switch (status) {
    case 'APPROVED': return 'text-green-700';
    case 'REJECTED': return 'text-red-700';
    case 'RESUBMISSION_REQUESTED': return 'text-amber-700';
    default: return 'text-blue-700';
  }
}

function StatusIcon({ status }: Readonly<{ status?: string }>) {
  switch (status) {
    case 'APPROVED': return <ShieldCheck className="w-5 h-5 text-green-600" />;
    case 'REJECTED': return <ShieldX className="w-5 h-5 text-red-600" />;
    case 'RESUBMISSION_REQUESTED': return <RotateCcw className="w-5 h-5 text-amber-600" />;
    default: return <Clock className="w-5 h-5 text-blue-600" />;
  }
}

function getStatusBadgeClass(status: string, fallback = 'bg-yellow-100 text-yellow-800'): string {
  const map: Record<string, string> = {
    COMPLETED: 'bg-green-100 text-green-800',
    APPROVED: 'bg-green-100 text-green-800',
    SUCCEEDED: 'bg-green-100 text-green-800',
    CONFIRMED: 'bg-blue-100 text-blue-800',
    REJECTED: 'bg-red-100 text-red-800',
    FAILED: 'bg-red-100 text-red-800',
  };
  return map[status] ?? fallback;
}

function getTokenRowBg(isExpired: boolean, isExpiring: boolean): string {
  if (isExpired) return 'bg-red-50';
  if (isExpiring) return 'bg-amber-50';
  return '';
}

function getExpiryBadgeClass(isExpired: boolean, isExpiring: boolean): string {
  if (isExpired) return 'bg-red-100 text-red-700';
  if (isExpiring) return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [profileAction, setProfileAction] = useState<string | null>(null);
  const [resubmissionNotes, setResubmissionNotes] = useState('');
  const [showResubmissionModal, setShowResubmissionModal] = useState(false);
  const [resubmissionFields, setResubmissionFields] = useState<string[]>([]);
  const navigate = useNavigate();

  const toggleResubmissionField = (key: string, checked: boolean) => {
    setResubmissionFields(prev =>
      checked ? [...prev, key] : prev.filter(f => f !== key)
    );
  };

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

  async function handleProfileAction(status: string, notes?: string, fields?: string[]) {
    if (!id) return;
    try {
      setProfileAction(status);
      await api.patch(`/admin/students/${id}/profile-status`, { status, notes, fields });
      const data = await fetchStudentDetail(id);
      setStudent(data);
      setShowResubmissionModal(false);
      setResubmissionNotes('');
      setResubmissionFields([]);
    } catch (err: any) {
      setError(err?.response?.data?.message || `Failed to ${status.toLowerCase()} profile`);
    } finally {
      setProfileAction(null);
    }
  }

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
          <Link to="/admin/students" className="text-blue-600 hover:underline mt-2 inline-block" data-testid="admin-student-detail-error-back-link">
            ← Back to Students
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8" data-testid="admin-student-detail-page">
      <Link
        to="/admin/students"
        className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
        data-testid="admin-student-detail-back-link"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Students
      </Link>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        {/* Student Profile Header with Avatar */}
        <div className="flex items-start gap-6 mb-6">
          {student.user.avatarUrl ? (
            <img
              src={student.user.avatarUrl}
              alt="Student avatar"
              className="w-20 h-20 rounded-full object-cover border-2 border-slate-200 flex-shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-2xl flex-shrink-0">
              {(student.user.name || student.user.email)?.charAt(0)?.toUpperCase() || 'S'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">
              {student.user.name || student.user.email}
            </h1>
            <p className="text-slate-600 mb-2">{student.user.email}</p>
            {student.user.phone && (
              <p className="text-sm text-slate-500">Phone: {student.user.phone}</p>
            )}
          </div>
          {/* Profile Completion Badge */}
          <div className="flex-shrink-0">
            {student.profileCompletion != null && (
              <div className={`px-3 py-2 rounded-lg text-center ${
                student.profileCompletion === 100
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-amber-50 border border-amber-200'
              }`}>
                <div className={`text-2xl font-bold ${
                  student.profileCompletion === 100 ? 'text-green-700' : 'text-amber-700'
                }`}>
                  {student.profileCompletion}%
                </div>
                <div className={`text-xs ${
                  student.profileCompletion === 100 ? 'text-green-600' : 'text-amber-600'
                }`}>
                  Profile
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Profile Completion Warning */}
        {student.missingFields && student.missingFields.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">Incomplete Profile</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {student.missingFields.map((field: string) => (
                    <span key={field} className="inline-flex items-center px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Profile Approval Status & Actions */}
        <div className="mb-4 p-4 rounded-lg border" style={{
          background: getStatusBackground(student.profileStatus),
          borderColor: getStatusBorderColor(student.profileStatus),
        }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <StatusIcon status={student.profileStatus} />
              <div>
                <span className="text-sm font-semibold">
                  Profile Status:{' '}
                  <span className={getStatusTextColor(student.profileStatus)}>
                    {student.profileStatus === 'RESUBMISSION_REQUESTED' ? 'Resubmission Requested' : (student.profileStatus || 'PENDING')}
                  </span>
                </span>
                {student.adminProfileNotes && (
                  <p className="text-xs text-slate-600 mt-0.5">Notes: {student.adminProfileNotes}</p>
                )}
                {student.resubmissionFields && student.resubmissionFields.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {student.resubmissionFields.map((f: string) => (
                      <span key={f} className="inline-flex items-center px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {student.profileStatus !== 'APPROVED' && (
                <button
                  onClick={() => handleProfileAction('APPROVED')}
                  disabled={!!profileAction}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-green-400 transition-colors"
                  data-testid="admin-student-detail-approve-button"
                >
                  {profileAction === 'APPROVED' ? 'Approving...' : 'Approve'}
                </button>
              )}
              {student.profileStatus !== 'REJECTED' && (
                <button
                  onClick={() => handleProfileAction('REJECTED', 'Profile does not meet requirements.')}
                  disabled={!!profileAction}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:bg-red-400 transition-colors"
                  data-testid="admin-student-detail-reject-button"
                >
                  {profileAction === 'REJECTED' ? 'Rejecting...' : 'Reject'}
                </button>
              )}
              <button
                onClick={() => setShowResubmissionModal(true)}
                disabled={!!profileAction}
                className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:bg-amber-400 transition-colors"
                data-testid="admin-student-detail-request-resubmission-button"
              >
                Request Resubmission
              </button>
            </div>
          </div>
        </div>

        {/* Resubmission Modal */}
        {showResubmissionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-bold text-slate-900 mb-3">Request Resubmission</h3>
              <p className="text-sm text-slate-600 mb-3">Select which fields need correction:</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { key: 'name', label: 'Name' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'bio', label: 'Bio' },
                  { key: 'grade', label: 'Grade' },
                  { key: 'board', label: 'Board' },
                  { key: 'timezone', label: 'Timezone' },
                  { key: 'preferredLanguage', label: 'Language' },
                  { key: 'marksheet', label: 'Marksheet' },
                  { key: 'avatar', label: 'Profile Photo' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={resubmissionFields.includes(key)}
                      onChange={(e) => toggleResubmissionField(key, e.target.checked)}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      data-testid={`admin-resubmission-field-${key}`}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="text-sm text-slate-600 mb-2">Add a note for the student (optional):</p>
              <textarea
                value={resubmissionNotes}
                onChange={(e) => setResubmissionNotes(e.target.value)}
                placeholder="e.g. Please upload a clearer marksheet image..."
                className="w-full border border-slate-300 rounded-lg p-3 text-sm h-24 resize-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                data-testid="admin-student-detail-resubmission-textarea"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => { setShowResubmissionModal(false); setResubmissionNotes(''); setResubmissionFields([]); }}
                  className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                  data-testid="admin-student-detail-resubmission-cancel-button"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleProfileAction('RESUBMISSION_REQUESTED', resubmissionNotes || 'Please update your profile.', resubmissionFields.length > 0 ? resubmissionFields : undefined)}
                  disabled={!!profileAction || resubmissionFields.length === 0}
                  className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-amber-400"
                  data-testid="admin-student-detail-resubmission-send-button"
                >
                  {profileAction ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Student Profile Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-50 rounded-lg p-3">
            <span className="text-xs font-medium text-slate-500 uppercase">Grade/Class</span>
            <p className="text-sm font-semibold text-slate-900 mt-1">{student.grade || 'Not set'}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <span className="text-xs font-medium text-slate-500 uppercase">Board</span>
            <p className="text-sm font-semibold text-slate-900 mt-1">{student.board || 'Not set'}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <span className="text-xs font-medium text-slate-500 uppercase">Timezone</span>
            <p className="text-sm font-semibold text-slate-900 mt-1">{student.timezone || 'Not set'}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <span className="text-xs font-medium text-slate-500 uppercase">Preferred Language</span>
            <p className="text-sm font-semibold text-slate-900 mt-1">
              {student.preferredLanguage
                ? ({ en: 'English', hi: 'Hindi', es: 'Spanish', fr: 'French', de: 'German' } as Record<string, string>)[student.preferredLanguage] || student.preferredLanguage
                : 'Not set'}
            </p>
          </div>
          {student.bio && (
            <div className="bg-slate-50 rounded-lg p-3 md:col-span-2">
              <span className="text-xs font-medium text-slate-500 uppercase">Bio</span>
              <p className="text-sm text-slate-900 mt-1 whitespace-pre-wrap">{student.bio}</p>
            </div>
          )}
        </div>

        {/* Marksheet */}
        {student.marksheetUrl && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Latest Class Marksheet</span>
            </div>
            {/\.(jpg|jpeg|png|webp)$/i.exec(student.marksheetUrl) ? (
              <img
                src={student.marksheetUrl}
                alt="Student Marksheet"
                className="max-h-64 rounded border border-blue-300"
              />
            ) : (
              <a
                href={student.marksheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
                data-testid="admin-student-detail-marksheet-link"
              >
                View Marksheet Document
              </a>
            )}
          </div>
        )}

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
            <button
              type="button"
              className="bg-slate-50 rounded-lg p-3 cursor-pointer hover:bg-blue-50 transition-colors w-full text-left"
              onClick={() => document.getElementById('conversations-section')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <div className="flex items-center mb-1">
                <MessageSquare className="w-4 h-4 text-slate-600 mr-2" />
                <span className="text-xs font-medium text-slate-700">Conversations</span>
              </div>
              <p className="text-sm font-semibold text-blue-600 underline">{student.conversations.length}</p>
            </button>
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

        {/* Admin: Delete User Account */}
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-red-800 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Delete User Account
              </p>
              <p className="text-xs text-red-600 mt-1">
                Permanently deactivate this student account. PII will be scrambled but transactional records are preserved.
              </p>
            </div>
            <button
              onClick={() => { setShowDeleteModal(true); setDeleteResult(null); }}
              disabled={deletingUser}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
              data-testid="admin-student-detail-delete-button"
            >
              <Trash2 className="w-4 h-4" />
              Delete Account
            </button>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
              {deleteResult ? (
                <>
                  <div className={`text-center mb-4 ${deleteResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                    <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3 ${deleteResult.ok ? 'bg-emerald-100' : 'bg-red-100'}">
                      {deleteResult.ok ? '✓' : '✕'}
                    </div>
                    <h3 className="text-lg font-semibold">{deleteResult.ok ? 'Account Deleted' : 'Delete Failed'}</h3>
                    <p className="text-sm mt-2 text-slate-600">{deleteResult.message}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowDeleteModal(false);
                      if (deleteResult.ok) navigate('/admin/students');
                    }}
                    className="w-full py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
                    data-testid="admin-student-detail-delete-result-close-button"
                  >
                    {deleteResult.ok ? 'Go to Students' : 'Close'}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                      <Trash2 className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Delete User Account</h3>
                      <p className="text-sm text-slate-500">This action cannot be undone</p>
                    </div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-red-800">
                      You are about to permanently deactivate <strong>{student.user.name || student.user.email}</strong>'s account.
                      Their personal data will be scrambled, but booking and payment records will be preserved for compliance.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDeleteModal(false)}
                      disabled={deletingUser}
                      className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium disabled:opacity-50"
                      data-testid="admin-student-detail-delete-cancel-button"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        setDeletingUser(true);
                        try {
                          await http.delete(`/users/${student.user.id}`);
                          setDeleteResult({ ok: true, message: 'Account has been permanently deactivated. All transactional records have been preserved.' });
                        } catch (err: any) {
                          setDeleteResult({ ok: false, message: err.response?.data?.message || 'Failed to delete user account' });
                        } finally {
                          setDeletingUser(false);
                        }
                      }}
                      disabled={deletingUser}
                      className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                      data-testid="admin-student-detail-delete-confirm-button"
                    >
                      {deletingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {deletingUser ? 'Deleting…' : 'Yes, Delete Account'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Token Balances by Tutor */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Token Balances by Tutor</h2>
        {student.tutorTokenBalances.length === 0 ? (
          <p className="text-slate-500">No token balances</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="admin-student-detail-token-balances-table">
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
                      className={`border-b ${getTokenRowBg(isExpired, isExpiring)}`}
                    >
                      <td className="py-2 px-4">
                        {balance.tutor.user.name || balance.tutor.user.email}
                      </td>
                      <td className="text-right py-2 px-4 font-semibold">
                        {Number(balance.balance).toFixed(2)} tokens
                      </td>
                      <td className="py-2 px-4">
                        {balance.daysUntilExpiry === null ? (
                          <span className="text-slate-500 text-sm">No expiry</span>
                        ) : (
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${getExpiryBadgeClass(isExpired, isExpiring)}`}>
                            {isExpired ? '❌ Expired' : `⏰ ${balance.daysUntilExpiry} days`}
                          </span>
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
                  <span className={`px-2 py-1 rounded text-xs ${getStatusBadgeClass(booking.status, 'bg-slate-100 text-slate-800')}`}>
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
                  <span className={`px-2 py-1 rounded text-xs ${getStatusBadgeClass(req.status)}`}>
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
                  <span className={`px-2 py-1 rounded text-xs ${getStatusBadgeClass(req.status)}`}>
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
            <table className="w-full" data-testid="admin-student-detail-token-ledger-table">
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
            <table className="w-full" data-testid="admin-student-detail-purchases-table">
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
                      <span className={`px-2 py-1 rounded text-xs ${getStatusBadgeClass(payment.status)}`}>
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
                    data-testid={`admin-student-detail-conversation-${conv.id}`}
                  >
                    <p className="font-semibold text-sm text-slate-900 truncate">
                      {conv.tutor.user.name || conv.tutor.user.email}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {conv.messages.length} message{conv.messages.length === 1 ? '' : 's'}
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
