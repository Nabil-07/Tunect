import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import type { BalanceSheetResponse } from '../../../services/financeService';
import { exportBalanceSheetCsv, getBalanceSheet } from '../../../services/financeService';

const periods = [
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'half', label: 'Half-Yearly' },
  { value: 'year', label: 'Annual' },
];

function formatINR(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function BalanceSheetPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<'month' | 'quarter' | 'half' | 'year'>('month');
  const [sheet, setSheet] = useState<BalanceSheetResponse | null>(null);
  const [noteKey, setNoteKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDirector = !!user?.isDirector;

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getBalanceSheet({ period });
        if (alive) setSheet(data);
      } catch (err: any) {
        console.error('Failed to load balance sheet', err);
        if (alive) setError(err?.response?.data?.message || 'Failed to load balance sheet');
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [period]);

  const asOfDisplay = useMemo(() => {
    if (!sheet?.asOf) return '';
    return new Date(sheet.asOf).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  }, [sheet?.asOf]);

  const fyHeader = useMemo(() => {
    if (!sheet?.fiscalYearEnd || !sheet?.fiscalYearLabel) return '';
    const fyEndYear = new Date(sheet.fiscalYearEnd).getFullYear();
    return `For the period ended 31 March ${fyEndYear} (${sheet.fiscalYearLabel})`;
  }, [sheet?.fiscalYearEnd, sheet?.fiscalYearLabel]);

  const selectedNote = useMemo(() => {
    if (!noteKey || !sheet?.noteDetails) return undefined;
    return sheet.noteDetails[noteKey];
  }, [noteKey, sheet?.noteDetails]);

  const totals = sheet?.totals || { assets: 0, liabilities: 0, equity: 0 };
  const isBalanced = sheet?.validation?.isBalanced ?? true;
  const canExport = !!sheet && isBalanced;

  const handleExport = async () => {
    if (!sheet?.validation?.isBalanced) {
      setError('Balance sheet cannot be exported until balanced.');
      return;
    }
    try {
      const blob = await exportBalanceSheetCsv({ period });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'balance-sheet.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Export failed', err);
      setError(err?.response?.data?.message || 'Export failed');
    }
  };

  if (!isDirector) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold mb-2">Balance Sheet</h2>
        <p className="text-sm text-rose-600">Access denied. Only Director-level admins can view finance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Balance Sheet</h2>
          <p className="text-slate-600 text-sm">Ledger-derived, no manual overrides. Periods are as-of the end date.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
          >
            {periods.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              title={canExport ? 'Export CSV' : 'Balance sheet cannot be exported until balanced.'}
              disabled={!canExport}
          >
            Export CSV
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}
      {loading && <div className="text-sm text-slate-600">Loading…</div>}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-center mb-4">
          <div className="text-sm font-semibold tracking-wide text-slate-700">TUNECT TECHNOLOGIES PRIVATE LIMITED</div>
          <div className="text-lg font-bold text-slate-900">Balance Sheet</div>
          <div className="text-xs text-slate-500">{fyHeader || 'For the period ended 31 March —'} • Amounts in INR • Generated: {asOfDisplay || '—'}</div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <AssetsTable
            current={sheet?.assets.current || []}
            nonCurrent={sheet?.assets.nonCurrent || []}
            totalAssets={totals.assets}
            onNoteClick={(note) => setNoteKey(note)}
          />

          <EquityLiabilityTable
            equity={sheet?.equity || []}
            liabilitiesCurrent={sheet?.liabilities.current || []}
            liabilitiesNonCurrent={sheet?.liabilities.nonCurrent || []}
            totalLiabilities={totals.liabilities}
            totalEquity={totals.equity}
            onNoteClick={(note) => setNoteKey(note)}
          />
        </div>

        {!isBalanced ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 flex items-center justify-between">
            <span>TOTAL ASSETS ≠ TOTAL EQUITY + TOTAL LIABILITIES</span>
            <span>{formatINR(sheet?.validation?.difference || 0)}</span>
          </div>
        ) : (
          <div className="mt-4 text-sm text-slate-700">TOTAL ASSETS = TOTAL LIABILITIES & EQUITY <span className="font-semibold ml-2">{formatINR(totals.assets)}</span></div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-700">
        <div className="font-semibold mb-2">Notes</div>
        <ul className="list-disc ml-5 space-y-1">
          {(sheet?.notes || []).map((n) => (<li key={n}>{n}</li>))}
          <li>Exports are CSV today; PDF/Excel can be added later.</li>
          <li>Bans zero balances and recognize revenue immediately.</li>
        </ul>
      </div>

      {selectedNote && (
        <div className="fixed inset-0 bg-black/30 flex justify-end z-40" role="dialog" aria-modal="true">
          <div className="w-full max-w-md h-full bg-white shadow-2xl border-l border-slate-200 p-5 overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-xs uppercase text-slate-500">Note</div>
                <div className="text-lg font-semibold text-slate-900">{noteKey}</div>
              </div>
              <button className="text-slate-500 hover:text-slate-800" onClick={() => setNoteKey(null)}>Close</button>
            </div>
            <div className="space-y-3 text-sm text-slate-700">
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1">Calculation</div>
                <div className="font-mono text-xs bg-slate-50 border border-slate-100 rounded p-2">{selectedNote.formula}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1">Source Tables</div>
                <ul className="list-disc ml-5 space-y-1">
                  {selectedNote.sources.map((s) => (<li key={s}>{s}</li>))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1">Ledger Row Count</div>
                <div>{selectedNote.rowCount}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BalanceRow({ label, amount, note, onNoteClick, helperText }: { label: string; amount: number; note?: string; onNoteClick?: (note: string) => void; helperText?: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm text-slate-800">
      <div className="flex items-center gap-3">
        <span className="font-medium" title={helperText}>{label}</span>
        {note && (
          <button
            type="button"
            onClick={() => onNoteClick?.(note)}
            className="text-xs text-indigo-500 underline decoration-dotted"
          >
            {note}
          </button>
        )}
      </div>
      <span>{formatINR(amount)}</span>
    </div>
  );
}

function AssetsTable({
  current,
  nonCurrent,
  totalAssets,
  onNoteClick,
}: {
  current: { label: string; amount: number; note?: string }[];
  nonCurrent: { label: string; amount: number; note?: string }[];
  totalAssets: number;
  onNoteClick?: (note: string) => void;
}) {
  const totalCurrent = useMemo(() => current.reduce((s, l) => s + l.amount, 0), [current]);
  const totalNonCurrent = useMemo(() => nonCurrent.reduce((s, l) => s + l.amount, 0), [nonCurrent]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-700 mb-3">ASSETS</div>

      <div className="rounded-lg bg-white border border-slate-200 p-3 mb-3">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">A. Current Assets</div>
        {current.map((l) => (
          <BalanceRow
            key={l.label}
            {...l}
            onNoteClick={onNoteClick}
            helperText={l.label === 'Accounts Receivable' ? 'Amounts collected via payment gateway but not yet settled into bank.' : undefined}
          />
        ))}
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-sm font-semibold">
          <span>Total Current Assets</span>
          <span>{formatINR(totalCurrent)}</span>
        </div>
      </div>

      <div className="rounded-lg bg-white border border-slate-200 p-3 mb-3">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">B. Non-Current Assets</div>
        {nonCurrent.map((l) => <BalanceRow key={l.label} {...l} onNoteClick={onNoteClick} />)}
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-sm font-semibold">
          <span>Total Non-Current Assets</span>
          <span>{formatINR(totalNonCurrent)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
        <span>Total Assets</span>
        <span>{formatINR(totalAssets)}</span>
      </div>
    </div>
  );
}

function EquityLiabilityTable({
  equity,
  liabilitiesCurrent,
  liabilitiesNonCurrent,
  totalLiabilities,
  totalEquity,
  onNoteClick,
}: {
  equity: { label: string; amount: number; note?: string }[];
  liabilitiesCurrent: { label: string; amount: number; note?: string }[];
  liabilitiesNonCurrent: { label: string; amount: number; note?: string }[];
  totalLiabilities: number;
  totalEquity: number;
  onNoteClick?: (note: string) => void;
}) {
  const totalCurrLiab = useMemo(() => liabilitiesCurrent.reduce((s, l) => s + l.amount, 0), [liabilitiesCurrent]);
  const totalNonCurrLiab = useMemo(() => liabilitiesNonCurrent.reduce((s, l) => s + l.amount, 0), [liabilitiesNonCurrent]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-700 mb-3">EQUITY AND LIABILITIES</div>

      <div className="rounded-lg bg-white border border-slate-200 p-3 mb-3">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">A. Equity</div>
        {equity.map((l) => <BalanceRow key={l.label} {...l} onNoteClick={onNoteClick} />)}
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-sm font-semibold">
          <span>Total Equity</span>
          <span>{formatINR(totalEquity)}</span>
        </div>
      </div>

      <div className="rounded-lg bg-white border border-slate-200 p-3 mb-3">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">B. Current Liabilities</div>
        {liabilitiesCurrent.map((l) => <BalanceRow key={l.label} {...l} onNoteClick={onNoteClick} />)}
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-sm font-semibold">
          <span>Total Current Liabilities</span>
          <span>{formatINR(totalCurrLiab)}</span>
        </div>

        <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 mt-3">Non-Current Liabilities</div>
        {liabilitiesNonCurrent.map((l) => <BalanceRow key={l.label} {...l} onNoteClick={onNoteClick} />)}
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-sm font-semibold">
          <span>Total Non-Current Liabilities</span>
          <span>{formatINR(totalNonCurrLiab)}</span>
        </div>
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-sm font-semibold">
          <span>Total Liabilities</span>
          <span>{formatINR(totalLiabilities)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
        <span>Total Equity and Liabilities</span>
        <span>{formatINR(totalLiabilities + totalEquity)}</span>
      </div>
    </div>
  );
}
