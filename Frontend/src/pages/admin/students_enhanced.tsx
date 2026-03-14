// Enhanced Students Page with Filtering & Sorting
import { useEffect, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { fetchStudents, unbanUser, type StudentSummary } from '../../services/adminService';

type SortField = 'email' | 'grade' | 'tokens' | 'accountStatus' | 'profileStatus' | 'createdAt';
type SortOrder = 'asc' | 'desc';

export default function AdminStudents() {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const page = 1;
  const pageSize = 100;

  // Filters
  const [emailFilter, setEmailFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [accountStatusFilter, setAccountStatusFilter] = useState<'ALL' | 'ACTIVE' | 'BLOCKED'>('ALL');
  const [profileStatusFilter, setProfileStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESUBMISSION_REQUESTED'>('ALL');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchStudents({ page, pageSize }); // Load more for client-side filtering
        setStudents(data.items);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load students');
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleUnban = async (userId: string) => {
    try {
      await unbanUser(userId);
      // Reload students to get updated ban status
      const data = await fetchStudents({ page, pageSize });
      setStudents(data.items);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to unban user');
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filtered = useMemo(() => {
    let result = [...students];

    // Apply text filters
    if (emailFilter) {
      result = result.filter((s) => 
        s.user.email.toLowerCase().includes(emailFilter.toLowerCase())
      );
    }
    if (gradeFilter) {
      result = result.filter((s) => 
        (s.grade || '').toLowerCase().includes(gradeFilter.toLowerCase())
      );
    }
    if (accountStatusFilter !== 'ALL') {
      const isBanned = accountStatusFilter === 'BLOCKED';
      result = result.filter((s) => s.user.isBanned === isBanned);
    }
    if (profileStatusFilter !== 'ALL') {
      result = result.filter((s) => (s.profileStatus || 'PENDING') === profileStatusFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortField) {
        case 'email':
          aVal = a.user.email;
          bVal = b.user.email;
          break;
        case 'grade':
          aVal = a.grade || '';
          bVal = b.grade || '';
          break;
        case 'tokens':
          aVal = a.tokens;
          bVal = b.tokens;
          break;
        case 'accountStatus':
          aVal = a.user.isBanned ? 1 : 0;
          bVal = b.user.isBanned ? 1 : 0;
          break;
        case 'profileStatus':
          aVal = a.profileStatus || 'PENDING';
          bVal = b.profileStatus || 'PENDING';
          break;
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [students, emailFilter, gradeFilter, accountStatusFilter, profileStatusFilter, sortField, sortOrder]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 text-slate-300" />;
    return sortOrder === 'asc' ? 
      <ChevronUp className="w-3 h-3 text-indigo-600" /> : 
      <ChevronDown className="w-3 h-3 text-indigo-600" />;
  };

  return (
    <div className="space-y-4" data-testid="admin-students-enhanced-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Students</h2>
          <p className="text-slate-600 text-sm">Track tokens and recent activity. {filtered.length} of {students.length} shown.</p>
        </div>
      </div>

      {error && <div className="text-sm text-rose-600" data-testid="admin-students-enhanced-error-alert">{error}</div>}

      {loading ? (
        <div className="text-slate-600">Loading students...</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm" data-testid="admin-students-enhanced-table">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('email')}>
                    <span>Student</span>
                    <SortIcon field="email" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('grade')}>
                    <span>Grade</span>
                    <SortIcon field="grade" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('tokens')}>
                    <span>Tokens</span>
                    <SortIcon field="tokens" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('accountStatus')}>
                    <span>Account Status</span>
                    <SortIcon field="accountStatus" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('profileStatus')}>
                    <span>Profile Status</span>
                    <SortIcon field="profileStatus" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('createdAt')}>
                    <span>Created</span>
                    <SortIcon field="createdAt" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
              {/* Filter Row */}
              <tr className="bg-white">
                <th className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="Filter email..."
                    className="w-full text-xs border rounded px-2 py-1"
                    value={emailFilter}
                    onChange={(e) => setEmailFilter(e.target.value)}
                    data-testid="admin-students-enhanced-email-filter-input"
                  />
                </th>
                <th className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="Filter grade..."
                    className="w-full text-xs border rounded px-2 py-1"
                    value={gradeFilter}
                    onChange={(e) => setGradeFilter(e.target.value)}
                    data-testid="admin-students-enhanced-grade-filter-input"
                  />
                </th>
                <th className="px-4 py-2"></th>
                <th className="px-4 py-2">
                  <select
                    className="w-full text-xs border rounded px-2 py-1"
                    value={accountStatusFilter}
                    onChange={(e) => setAccountStatusFilter(e.target.value as any)}
                    data-testid="admin-students-enhanced-account-status-select"
                  >
                    <option value="ALL">All</option>
                    <option value="ACTIVE">Active</option>
                    <option value="BLOCKED">Blocked</option>
                  </select>
                </th>
                <th className="px-4 py-2">
                  <select
                    className="w-full text-xs border rounded px-2 py-1"
                    value={profileStatusFilter}
                    onChange={(e) => setProfileStatusFilter(e.target.value as any)}
                    data-testid="admin-students-enhanced-profile-status-select"
                  >
                    <option value="ALL">All</option>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="RESUBMISSION_REQUESTED">Resubmission</option>
                  </select>
                </th>
                <th className="px-4 py-2"></th>
                <th className="px-4 py-2"></th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{s.user.email}</div>
                    <div className="text-xs text-slate-500">{s.id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{s.grade || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{s.tokens}</td>
                  <td className="px-4 py-3">
                    {s.user.isBanned ? (
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          🚫 Blocked
                        </span>
                        {s.user.bannedAt && (
                          <span className="text-xs text-slate-500">
                            {new Date(s.user.bannedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        ✓ Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const status = s.profileStatus || 'PENDING';
                      const styles: Record<string, string> = {
                        APPROVED: 'bg-green-100 text-green-800',
                        PENDING: 'bg-blue-100 text-blue-800',
                        REJECTED: 'bg-red-100 text-red-800',
                        RESUBMISSION_REQUESTED: 'bg-amber-100 text-amber-800',
                      };
                      const labels: Record<string, string> = {
                        APPROVED: '✓ Approved',
                        PENDING: '⏳ Pending',
                        REJECTED: '✗ Rejected',
                        RESUBMISSION_REQUESTED: '↻ Resubmission',
                      };
                      return (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-slate-100 text-slate-800'}`}>
                          {labels[status] || status}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {s.user.isBanned && (
                      <button
                        className="text-green-600 text-sm font-semibold"
                        onClick={() => handleUnban(s.user.id)}
                        data-testid={`admin-students-enhanced-unblock-${s.id}`}
                      >
                        Unblock
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
