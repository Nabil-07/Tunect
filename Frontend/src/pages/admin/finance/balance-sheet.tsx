import { useEffect, useState, type ReactNode } from 'react';
import api from '../../../lib/apiClient';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type BalanceSheetLine = { label: string; amount: number; note?: string };

type BalanceSheet = {
  asOf: string;
  period: string;
  assets: {
    current: BalanceSheetLine[];
    nonCurrent: BalanceSheetLine[];
  };
  liabilities: {
    current: BalanceSheetLine[];
    nonCurrent: BalanceSheetLine[];
  };
  equity: BalanceSheetLine[];
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
  };
  validation?: {
    isBalanced: boolean;
    difference: number;
  };
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);

function Section({ title, lines }: Readonly<{ title: string; lines: BalanceSheetLine[] }>) {
  if (!lines.length) return null;
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</div>
      {lines.map((l, i) => (
        <div key={`${l.label}-${l.note ?? ''}-${i}`} className="flex items-center justify-between py-1.5 px-2 text-sm hover:bg-slate-50 rounded">
          <span className="text-slate-700">
            {l.label}
            {l.note && <span className="text-xs text-slate-400 ml-2">({l.note})</span>}
          </span>
          <span className="font-mono text-slate-900">{fmt(l.amount)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between py-1.5 px-2 text-sm font-semibold border-t mt-1">
        <span>Subtotal</span>
        <span className="font-mono">{fmt(total)}</span>
      </div>
    </div>
  );
}

export default function BalanceSheetPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'month' | 'quarter' | 'half' | 'year'>('month');
  const [exporting, setExporting] = useState(false);

  const loadData = async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data: sheet } = await api.get<BalanceSheet>('/admin/finance/dashboard', { params: { period: p } });
      setData(sheet);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load balance sheet');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(period);
  }, [period]);

  useEffect(() => {
    const id = globalThis.setInterval(() => {
      loadData(period);
    }, 20_000);
    return () => globalThis.clearInterval(id);
  }, [period]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/admin/finance/dashboard/export', {
        params: { period },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `balance-sheet-${period}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const totalAssets = (data as any)?.totals?.totalAssets ?? data?.totals?.assets ?? 0;
  const totalLiabilities = (data as any)?.totals?.totalLiabilities ?? data?.totals?.liabilities ?? 0;
  const totalEquity = (data as any)?.totals?.totalEquity ?? data?.totals?.equity ?? 0;
  const checksum = (data as any)?.totals?.checksum ?? data?.validation?.difference ?? 0;
  let content: ReactNode = null;

  if (loading) {
    content = (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading balance sheet…
      </div>
    );
  } else if (data) {
    content = (
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold mb-4 text-emerald-700">Assets</h2>
          <Section title="Current Assets" lines={data.assets.current} />
          <Section title="Non-Current Assets" lines={data.assets.nonCurrent} />
          <div className="flex items-center justify-between py-2 px-2 text-base font-bold border-t-2 border-emerald-200 mt-2">
            <span>Total Assets</span>
            <span className="font-mono text-emerald-700">{fmt(totalAssets)}</span>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold mb-4 text-rose-700">Liabilities</h2>
          <Section title="Current Liabilities" lines={data.liabilities.current} />
          <Section title="Non-Current Liabilities" lines={data.liabilities.nonCurrent} />
          <div className="flex items-center justify-between py-2 px-2 text-base font-bold border-t-2 border-rose-200 mt-2">
            <span>Total Liabilities</span>
            <span className="font-mono text-rose-700">{fmt(totalLiabilities)}</span>
          </div>

          <h2 className="text-lg font-bold mb-4 mt-6 text-indigo-700">Equity</h2>
          <Section title="Shareholders' Equity" lines={data.equity} />
          <div className="flex items-center justify-between py-2 px-2 text-base font-bold border-t-2 border-indigo-200 mt-2">
            <span>Total Equity</span>
            <span className="font-mono text-indigo-700">{fmt(totalEquity)}</span>
          </div>
        </div>

        <div className="md:col-span-2 rounded-xl bg-slate-50 border p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-600">
            Assets = Liabilities + Equity check
          </span>
          <span className={`text-sm font-bold ${Math.abs(checksum) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {Math.abs(checksum) < 0.01 ? 'Balanced' : `Difference: ${fmt(checksum)}`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="balance-sheet-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/finance')}
            data-testid="balance-sheet-back-button"
            className="rounded-lg p-2 hover:bg-slate-100"
            aria-label="Back to Finance"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Balance Sheet</h1>
            <p className="text-sm text-slate-600">
              {data?.asOf ? `As of ${new Date(data.asOf).toLocaleDateString()}` : 'Ledger-derived financial statements'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            data-testid="balance-sheet-period-select"
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="half">Half Year</option>
            <option value="year">Full Year</option>
          </select>
          <button
            onClick={handleExport}
            disabled={exporting || loading}
            data-testid="balance-sheet-export-button"
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="balance-sheet-error-alert">{error}</div>
      )}
      {content}
    </div>
  );
}
