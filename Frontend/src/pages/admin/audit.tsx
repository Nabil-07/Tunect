import { useEffect, useState } from 'react';
import { Calendar, User, FileText, Search } from 'lucide-react';
import { http as api } from '../../api/http';

interface AuditLog {
  id: string;
  adminId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeData: any;
  afterData: any;
  endpoint?: string;
  ipAddress?: string;
  createdAt: string;
  admin: {
    id: string;
    email: string;
  };
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    entityType: '',
    from: '',
    to: '',
  });

  useEffect(() => {
    loadLogs();
  }, [page, filters]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const params: any = { page, pageSize: 20 };
      if (filters.entityType) params.entityType = filters.entityType;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;

      const { data } = await api.get('/admin/audit', { params });
      setLogs(data.items || []);
      setTotalPages(data.meta?.totalPages || 1);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Admin Audit Log</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Entity Type</label>
            <select
              value={filters.entityType}
              onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="TUTOR">Tutor</option>
              <option value="STUDENT">Student</option>
              <option value="BOOKING">Booking</option>
              <option value="PAYMENT">Payment</option>
              <option value="TOKEN_TRANSFER_REQUEST">Token Transfer</option>
              <option value="REFUND_REQUEST">Refund Request</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">From Date</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">To Date</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setFilters({ entityType: '', from: '', to: '' })}
              className="w-full px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-slate-500">No audit logs found</div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Admin</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Endpoint</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">IP Address</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {log.admin.email}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {log.entityType} ({log.entityId.substring(0, 8)}...)
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 font-mono text-xs">
                      {log.endpoint || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 font-mono text-xs">
                      {log.ipAddress || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <details className="cursor-pointer">
                        <summary className="text-blue-600 hover:text-blue-800">View</summary>
                        <div className="mt-2 p-2 bg-slate-50 rounded text-xs">
                          <div className="mb-1">
                            <strong>Before:</strong>
                            <pre className="mt-1 text-xs overflow-auto">
                              {JSON.stringify(log.beforeData, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <strong>After:</strong>
                            <pre className="mt-1 text-xs overflow-auto">
                              {JSON.stringify(log.afterData, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-sm text-slate-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
