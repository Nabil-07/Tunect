// Enhanced Students Page with Filtering & Sorting
import { useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronUp, ChevronDown, ChevronDown as ChevronDownIcon } from 'lucide-react';
import { TableRowSkeleton } from '../../components/skeletons';
import { fetchStudents, unbanUser, type StudentSummary, type PaginationMeta } from '../../services/adminService';

type SortField = 'name' | 'grade' | 'tokens' | 'accountStatus' | 'createdAt';
type SortOrder = 'asc' | 'desc';

export default function AdminStudents() {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unbanError, setUnbanError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);

  // Filters
  const [nameFilter, setNameFilter] = useState('');
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const nameDropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [gradeFilter, setGradeFilter] = useState('');
  const [accountStatusFilter, setAccountStatusFilter] = useState<'ALL' | 'ACTIVE' | 'BLOCKED'>('ALL');
  const [allStudentsLoaded, setAllStudentsLoaded] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Only load data once on mount, not on page/pageSize changes
  useEffect(() => {
    if (initialLoadDone) return; // Don't reload after initial load
    
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load all students for client-side pagination and dropdown
        let allItems: StudentSummary[] = [];
        let currentPage = 1;
        let hasMore = true;
        let totalPages = 1;
        
        while (hasMore) {
          const data = await fetchStudents({ page: currentPage, pageSize: 100 });
          allItems = allItems.concat(data.items);
          totalPages = data.meta?.totalPages || 1;
          
          if (currentPage >= totalPages) {
            hasMore = false;
          }
          currentPage++;
        }
        
        setStudents(allItems);
        setAllStudentsLoaded(true);
        setInitialLoadDone(true);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load students');
        setStudents([]);
        setMeta(null);
        setInitialLoadDone(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [initialLoadDone]);

  const handleUnban = async (userId: string) => {
    try {
      await unbanUser(userId);
      // Reload all students to get updated ban status
      let allItems: StudentSummary[] = [];
      let currentPage = 1;
      let hasMore = true;
      let totalPages = 1;
      
      while (hasMore) {
        const data = await fetchStudents({ page: currentPage, pageSize: 100 });
        allItems = allItems.concat(data.items);
        totalPages = data.meta?.totalPages || 1;
        
        if (currentPage >= totalPages) {
          hasMore = false;
        }
        currentPage++;
      }
      
      setStudents(allItems);
      setPage(1);
      setError(null);
      setUnbanError(null);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to unban user';
      setError(message);
      setUnbanError(message);
    }
  };

  const getDisplayName = (user: any) => {
    if (!user) return '';
    return user.name?.trim() ? user.name : (user.email || '');
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

    // Apply name text filter
    if (nameFilter) {
      result = result.filter((s) => {
        const name = getDisplayName(s.user);
        return name ? name.toLowerCase().includes(nameFilter.toLowerCase()) : false;
      });
    }

    // Apply name multi-select filter
    if (selectedNames.size > 0) {
      result = result.filter((s) => {
        const name = getDisplayName(s.user);
        return selectedNames.has(name);
      });
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
        case 'name':
          aVal = getDisplayName(a.user).toLowerCase();
          bVal = getDisplayName(b.user).toLowerCase();
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
  }, [students, nameFilter, selectedNames, gradeFilter, accountStatusFilter, sortField, sortOrder, getDisplayName]);

  // Paginate filtered results for display
  const totalFilteredCount = filtered.length;
  const totalPages = Math.ceil(totalFilteredCount / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedResults = filtered.slice(startIndex, endIndex);

  // Get unique names for dropdown and filter by search input
  const uniqueNames = useMemo(() => {
    const names = students.map(s => getDisplayName(s.user)).filter(Boolean);
    const unique = Array.from(new Set(names)).sort();
    
    // Filter by nameFilter input
    if (nameFilter.trim()) {
      return unique.filter(name => 
        name.toLowerCase().includes(nameFilter.toLowerCase())
      );
    }
    return unique;
  }, [students, nameFilter]);

  // Handle select all
  const handleSelectAll = () => {
    if (selectedNames.size === uniqueNames.length) {
      setSelectedNames(new Set());
    } else {
      setSelectedNames(new Set(uniqueNames));
    }
  };

  // Handle individual name toggle
  const handleNameToggle = (name: string) => {
    const newSelected = new Set(selectedNames);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelectedNames(newSelected);
  };

  // Calculate dropdown position
  const updateDropdownPosition = () => {
    if (nameDropdownRef.current) {
      const rect = nameDropdownRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  };

  // Handle dropdown toggle with position calculation
  const handleDropdownToggle = () => {
    if (!showNameDropdown) {
      updateDropdownPosition();
    }
    setShowNameDropdown(!showNameDropdown);
  };

  // Update position on scroll/resize
  useEffect(() => {
    if (showNameDropdown) {
      const handleScroll = () => updateDropdownPosition();
      const handleResize = () => updateDropdownPosition();
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [showNameDropdown]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (nameDropdownRef.current && !nameDropdownRef.current.contains(event.target as Node)) {
        setShowNameDropdown(false);
      }
    };
    if (showNameDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNameDropdown]);

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
                  <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort('name')}>
                    <span>Student</span>
                    <SortIcon field="name" />
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
                  <div className="relative" ref={nameDropdownRef}>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="Filter name..."
                        className="flex-1 text-xs border rounded px-2 py-1 pr-6"
                        value={nameFilter}
                        onChange={(e) => setNameFilter(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={handleDropdownToggle}
                        className="text-slate-500 hover:text-slate-700 p-1"
                      >
                        <ChevronDownIcon className="w-4 h-4" />
                      </button>
                    </div>
                    {showNameDropdown && (
                      <div 
                        className="fixed z-[9999] bg-white border border-slate-200 rounded-lg shadow-lg max-h-96 overflow-y-auto"
                        style={{
                          top: `${dropdownPosition.top}px`,
                          left: `${dropdownPosition.left}px`,
                          width: `${dropdownPosition.width}px`,
                        }}
                      >
                        <div className="p-2 sticky top-0 bg-white border-b border-slate-200">
                          <p className="text-xs text-slate-500 mb-2">
                            {nameFilter.trim() ? `${uniqueNames.length} results found` : `${uniqueNames.length} students`}
                            {allStudentsLoaded && nameFilter.trim() === '' && ` (all loaded)`}
                          </p>
                        </div>
                        <div className="p-2">
                          <label className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer rounded">
                            <input
                              type="checkbox"
                              checked={selectedNames.size === uniqueNames.length && uniqueNames.length > 0}
                              onChange={handleSelectAll}
                              className="rounded"
                            />
                            <span className="text-xs font-semibold">Select All</span>
                          </label>
                          <div className="border-t border-slate-200 my-1"></div>
                          {uniqueNames.length > 0 ? (
                            uniqueNames.map((name) => (
                              <label
                                key={name}
                                className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer rounded"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedNames.has(name)}
                                  onChange={() => handleNameToggle(name)}
                                  className="rounded"
                                />
                                <span className="text-xs">{name}</span>
                              </label>
                            ))
                          ) : (
                            <div className="p-2 text-xs text-slate-500 text-center">No results found</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
              {paginatedResults.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link 
                      to={`/admin/students/${s.id}`}
                      className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {getDisplayName(s.user)}
                    </Link>
                    <div className="text-xs text-slate-500">{s.user.email}</div>
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
        <div className="flex items-center gap-4">
          <div>
            Page {page} of {totalPages} · Showing {paginatedResults.length} of {totalFilteredCount} records
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="pageSize" className="text-slate-600">
              Rows:
            </label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 rounded border border-slate-200 text-slate-700"
            >
              <option value={10}>10</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50"
            onClick={() => setPage(1)}
            disabled={page === 1 || loading}
            title="First page"
          >
            First
          </button>
          <button
            className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            title="Previous page"
          >
            Previous
          </button>
          <button
            className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            title="Next page"
          >
            Next
          </button>
          <button
            className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50"
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages || loading}
            title="Last page"
          >
            Last
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
