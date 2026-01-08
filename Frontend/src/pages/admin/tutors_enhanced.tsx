// Enhanced Tutors Page with Filtering & Sorting
import { useEffect, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import {
  fetchTutors,
  updateTutorStatus,
  unbanUser,
  type TutorSummary,
  type TutorStatus,
} from '../../services/adminService';

type SortField = 'email' | 'status' | 'accountStatus' | 'hourlyRate' | 'createdAt';
type SortOrder = 'asc' | 'desc';

export default function AdminTutors() {
  const [tutors, setTutors] = useState<TutorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TutorSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | TutorStatus>('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 100;

  // Filters
  const [emailFilter, setEmailFilter] = useState('');
  const [bioFilter, setBioFilter] = useState('');
  const [subjectsFilter, setSubjectsFilter] = useState('');
  const [accountStatusFilter, setAccountStatusFilter] = useState<'ALL' | 'ACTIVE' | 'BLOCKED'>('ALL');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchTutors({ 
          status: statusFilter === 'ALL' ? undefined : statusFilter, 
          page, 
          pageSize // Load more for client-side filtering
        });
        setTutors(data.items);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load tutors');
        setTutors([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [statusFilter, page, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filtered = useMemo(() => {
    let result = [...tutors];

    // Apply status filter
    if (statusFilter !== 'ALL') {
      result = result.filter((t) => t.status === statusFilter);
    }

    // Apply text filters
    if (emailFilter) {
      result = result.filter((t) => 
        t.user.email.toLowerCase().includes(emailFilter.toLowerCase())
      );
    }
    if (bioFilter) {
      result = result.filter((t) => 
        (t.bio || '').toLowerCase().includes(bioFilter.toLowerCase())
      );
    }
    if (subjectsFilter) {
      result = result.filter((t) => 
        t.subjects?.some(s => s.toLowerCase().includes(subjectsFilter.toLowerCase()))
      );
    }
    if (accountStatusFilter !== 'ALL') {
      const isBanned = accountStatusFilter === 'BLOCKED';
      result = result.filter((t) => t.user.isBanned === isBanned);
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortField) {
        case 'email':
          aVal = a.user.email;
          bVal = b.user.email;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'accountStatus':
          aVal = a.user.isBanned ? 1 : 0;
          bVal = b.user.isBanned ? 1 : 0;
          break;
        case 'hourlyRate':
          aVal = a.hourlyRate || 0;
          bVal = b.hourlyRate || 0;
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
  }, [tutors, statusFilter, emailFilter, bioFilter, subjectsFilter, accountStatusFilter, sortField, sortOrder]);

  const handleStatusChange = async (id: string, status: TutorStatus) => {
    try {
      await updateTutorStatus(id, status);
      setTutors((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update status');
    }
  };

  const handleUnban = async (userId: string) => {
    try {
      await unbanUser(userId);
      // Reload tutors to get updated ban status
      const data = await fetchTutors({ status: statusFilter === 'ALL' ? undefined : statusFilter, page, pageSize });
      setTutors(data.items);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to unban user');
    }
  };

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
          <h2 className="text-2xl font-bold">Tutors</h2>
          <p className="text-slate-600 text-sm">Review info, subjects, and statuses. {filtered.length} of {tutors.length} shown.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}

      {loading ? (
        <div className="text-slate-600">Loading tutors...</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('email')}>
                    <span>Tutor</span>
                    <SortIcon field="email" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left">Bio</th>
                <th className="px-4 py-3 text-left">Subjects</th>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('status')}>
                    <span>Status</span>
                    <SortIcon field="status" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('accountStatus')}>
                    <span>Account Status</span>
                    <SortIcon field="accountStatus" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('hourlyRate')}>
                    <span>Hourly rate</span>
                    <SortIcon field="hourlyRate" />
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
                  />
                </th>
                <th className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="Filter bio..."
                    className="w-full text-xs border rounded px-2 py-1"
                    value={bioFilter}
                    onChange={(e) => setBioFilter(e.target.value)}
                  />
                </th>
                <th className="px-4 py-2">
                  <input
                    type="text"
                    placeholder="Filter subjects..."
                    className="w-full text-xs border rounded px-2 py-1"
                    value={subjectsFilter}
                    onChange={(e) => setSubjectsFilter(e.target.value)}
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
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{t.user.email}</div>
                    <div className="text-xs text-slate-500">{t.id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 max-w-xs truncate" title={t.bio || undefined}>{t.bio || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{t.subjects?.length ? t.subjects.join(', ') : '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      className="border rounded px-2 py-1 text-xs"
                      value={t.status}
                      onChange={(e) => handleStatusChange(t.id, e.target.value as TutorStatus)}
                    >
                      <option value="PENDING">Pending</option>
                      <option value="APPROVED">Approved</option>
                      <option value="REJECTED">Rejected</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {t.user.isBanned ? (
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          🚫 Blocked
                        </span>
                        {t.user.bannedAt && (
                          <span className="text-xs text-slate-500">
                            {new Date(t.user.bannedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        ✓ Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{t.hourlyRate ? `₹${t.hourlyRate}` : '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        className="text-indigo-600 text-sm font-semibold"
                        onClick={() => setSelected(t)}
                      >
                        View
                      </button>
                      {t.user.isBanned && (
                        <button
                          className="text-green-600 text-sm font-semibold"
                          onClick={() => handleUnban(t.user.id)}
                        >
                          Unblock
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-6 p-6 border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                  <div className="text-lg font-semibold">{selected.user.email}</div>
                  <div className="text-sm text-slate-500">Tutor ID: {selected.id}</div>
              </div>
              <button className="text-slate-500" onClick={() => setSelected(null)}>Close</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700">
              <div><span className="font-semibold">Subjects: </span>{selected.subjects?.join(', ') || '—'}</div>
              <div><span className="font-semibold">Status: </span>{selected.status}</div>
              <div><span className="font-semibold">Hourly rate: </span>{selected.hourlyRate ? `₹${selected.hourlyRate}` : '—'}</div>
              <div><span className="font-semibold">Created: </span>{new Date(selected.createdAt).toLocaleString()}</div>
              <div><span className="font-semibold">Account: </span>{selected.user.isBanned ? '🚫 Blocked' : '✓ Active'}</div>
              {selected.user.isBanned && selected.user.bannedAt && (
                <div><span className="font-semibold">Banned At: </span>{new Date(selected.user.bannedAt).toLocaleString()}</div>
              )}
            </div>
            <div className="mt-4 text-sm text-slate-700">
              <div className="font-semibold mb-1">Bio</div>
              <p className="text-slate-600">{selected.bio || 'No bio provided.'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
