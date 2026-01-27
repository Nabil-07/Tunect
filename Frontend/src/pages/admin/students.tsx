// Enhanced Students Page with Filtering & Sorting
import { useEffect, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { TableRowSkeleton } from '../../components/skeletons';
import { fetchStudents, unbanUser, type StudentSummary, type PaginationMeta } from '../../services/adminService';

type SortField = 'email' | 'grade' | 'tokens' | 'accountStatus' | 'createdAt';
type SortOrder = 'asc' | 'desc';

export default function AdminStudents() {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unbanError, setUnbanError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const [meta, setMeta] = useState<PaginationMeta | null>(null);

  // Filters
  const [emailFilter, setEmailFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [accountStatusFilter, setAccountStatusFilter] = useState<'ALL' | 'ACTIVE' | 'BLOCKED'>('ALL');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        // Load all students for client-side filtering (no search query)
        const data = await fetchStudents({ page, pageSize });
        setStudents(data.items);
        setMeta(data.meta);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load students');
        setStudents([]);
        setMeta(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page, pageSize]);

  const handleUnban = async (userId: string) => {
    try {
      await unbanUser(userId);
      // Reload students to get updated ban status
      const data = await fetchStudents({ page, pageSize });
      setStudents(data.items);
      setMeta(data.meta);
      setError(null);
      setUnbanError(null);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to unban user';
      setError(message);
      setUnbanError(message);
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

    // Apply text filters (client-side filtering - no API calls)
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
  }, [students, emailFilter, gradeFilter, accountStatusFilter, sortField, sortOrder]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 text-slate-300" />;
    return sortOrder === 'asc' ? 
      <ChevronUp className="w-3 h-3 text-indigo-600" /> : 
      <ChevronDown className="w-3 h-3 text-indigo-600" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Students</h2>
          <p className="text-slate-600 text-sm">
            {loading ? 'Loading…' : `Track tokens and recent activity. ${filtered.length} of ${students.length} shown.`}
          </p>
        </div>
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}

      {loading ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Grade</th>
                <th className="px-4 py-3 text-left">Tokens</th>
                <th className="px-4 py-3 text-left">Account Status</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from({ length: 10 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={6} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
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
                    placeholder="Search email..."
                    className="w-full text-xs border rounded px-2 py-1"
                    value={emailFilter}
                    onChange={(e) => setEmailFilter(e.target.value)}
                  />
                </th>
                <th className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="Filter grade..."
                    className="w-full text-xs border rounded px-2 py-1"
                    value={gradeFilter}
                    onChange={(e) => setGradeFilter(e.target.value)}
                  />
                </th>
                <th className="px-4 py-2"></th>
                <th className="px-4 py-2">
                  <select
                    className="w-full text-xs border rounded px-2 py-1"
                    value={accountStatusFilter}
                    onChange={(e) => setAccountStatusFilter(e.target.value as any)}
                  >
                    <option value="ALL">All</option>
                    <option value="ACTIVE">Active</option>
                    <option value="BLOCKED">Blocked</option>
                  </select>
                </th>
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
                    <div className="flex flex-col gap-1">
                      {s.user.isBanned ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          🚫 Blocked
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✓ Active
                        </span>
                      )}
                      {s.user.bannedAt && (
                        <span className="text-xs text-slate-500">
                          {new Date(s.user.bannedAt).toLocaleDateString()}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        Strikes: {s.user.piiStrikes}/{s.user.piiMaxStrikes}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {(s.user.isBanned || s.user.piiStrikes >= s.user.piiMaxStrikes) && (
                      <button
                        className="text-green-600 text-sm font-semibold"
                        onClick={() => handleUnban(s.user.id)}
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

      <div className="flex items-center justify-between text-sm text-slate-600">
        <div>
          Page {meta?.page ?? page} of {meta?.totalPages ?? 1} · Total {meta?.total ?? students.length}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={(meta?.page ?? page) <= 1 || loading}
          >
            Previous
          </button>
          <button
            className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50"
            onClick={() => setPage((p) => (meta?.totalPages ? Math.min(meta.totalPages, p + 1) : p + 1))}
            disabled={loading || (meta?.totalPages ? (meta.page ?? page) >= meta.totalPages : false)}
          >
            Next
          </button>
        </div>
      </div>

      {unbanError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" onClick={() => setUnbanError(null)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-6 p-5 border border-rose-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="mt-1 h-8 w-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center text-lg">!</div>
              <div className="flex-1">
                <div className="text-lg font-semibold text-slate-900">Unban failed</div>
                <p className="mt-1 text-sm text-slate-700">{unbanError}</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"
                onClick={() => setUnbanError(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
