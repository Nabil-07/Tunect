// src/components/admin/recon/ReconTable.tsx
import { useMemo, useState } from 'react';
import { Filter, Pencil } from 'lucide-react';
import type { ReconRow } from '../../../services/reconService';

const STATUS_COLORS: Record<string, string> = {
  MATCHED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  MISMATCH: 'bg-rose-50 text-rose-700 border-rose-200',
  MISSING_BANK: 'bg-amber-50 text-amber-700 border-amber-200',
  MISSING_GATEWAY: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  ADJUSTED: 'bg-sky-50 text-sky-700 border-sky-200',
};

export default function ReconTable({
  rows,
  onAdjust,
}: {
  rows: ReconRow[];
  onAdjust: (ref?: string) => void;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('ALL');

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const matchesQ = !q || [r.ref, r.description, r.date].some(v => (v ?? '').toLowerCase().includes(q.toLowerCase()));
      const matchesStatus = status === 'ALL' || r.status === status;
      return matchesQ && matchesStatus;
    });
  }, [rows, q, status]);

  return (
    <div className="rounded-2xl border" data-testid="recon-table">
      <div className="p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 border rounded-lg px-3 h-10">
          <Filter className="h-4 w-4 opacity-70" />
          <input
            className="outline-none text-sm"
            placeholder="Search ref/description"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="recon-table-search-input"
          />
        </div>
        <select
          className="h-10 px-3 rounded-lg border text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          data-testid="recon-table-status-select"
        >
          <option value="ALL">All statuses</option>
          <option value="MATCHED">Matched</option>
          <option value="MISMATCH">Mismatch</option>
          <option value="MISSING_BANK">Missing (Bank)</option>
          <option value="MISSING_GATEWAY">Missing (Gateway)</option>
          <option value="ADJUSTED">Adjusted</option>
        </select>
        <div className="text-sm text-slate-600 ml-auto">{filtered.length} results</div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" data-testid="recon-table-data">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <Th>Date</Th>
              <Th>Ref</Th>
              <Th>Description</Th>
              <Th className="text-right">Bank</Th>
              <Th className="text-right">Gateway</Th>
              <Th className="text-right">Diff</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t">
                <Td>{r.date.slice(0, 10)}</Td>
                <Td mono>{r.ref}</Td>
                <Td>{r.description ?? '-'}</Td>
                <Td right>₹{r.bankAmount.toLocaleString('en-IN')}</Td>
                <Td right>₹{r.gatewayAmount.toLocaleString('en-IN')}</Td>
                <Td right className={r.diff !== 0 ? 'text-rose-600 font-medium' : ''}>
                  ₹{r.diff.toLocaleString('en-IN')}
                </Td>
                <Td>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${STATUS_COLORS[r.status] || 'bg-slate-50'}`}>
                    {r.status}
                  </span>
                </Td>
                <Td>
                  <button
                    className="inline-flex items-center gap-1 h-8 px-2 rounded border hover:bg-slate-50"
                    onClick={() => onAdjust(r.ref)}
                    title="Adjust"
                    data-testid={`recon-table-adjust-btn-${r.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Adjust
                  </button>
                </Td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500">No rows</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium text-slate-700 ${className ?? ''}`}>{children}</th>;
}
function Td({ children, right, mono, className }: { children: React.ReactNode; right?: boolean; mono?: boolean; className?: string }) {
  return (
    <td className={`px-3 py-2 ${right ? 'text-right' : ''} ${mono ? 'font-mono text-xs' : ''} ${className ?? ''}`}>
      {children}
    </td>
  );
}
