// src/pages/admin/finance/recon.tsx
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw, Upload, Plus, FileText } from 'lucide-react';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import {
  getDaily,
  uploadBank,
  uploadGateway,
  createAdjustment,
  type DailyReconResponse,
} from '../../../services/reconService';
import UploadCard from '../../../components/admin/recon/UploadCard';
import ReconTable from '../../../components/admin/recon/ReconTable';
import AdjustmentModal from '../../../components/admin/recon/AdjustmentModal';

export default function Recon() {
  const { user } = useAuth() as any;
  const nav = useNavigate();

  // simple admin guard
  useEffect(() => {
    if (!user || String(user.role ?? '').toUpperCase() !== 'ADMIN') {
      nav('/'); // or your admin login
    }
  }, [user, nav]);

  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DailyReconResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustDefaultRef, setAdjustDefaultRef] = useState<string | undefined>(undefined);

  async function fetchDaily(d = date) {
    setLoading(true);
    setErr(null);
    try {
      const res = await getDaily(d);
      setData(res);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Failed to load reconciliation');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDaily(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(
    () =>
      data?.totals ?? { bank: 0, gateway: 0, diff: 0, matchedCount: 0, mismatchedCount: 0 },
    [data]
  );

  const onUploadBank = async (file: File) => {
    await uploadBank(file);
    await fetchDaily(date);
  };

  const onUploadGateway = async (file: File) => {
    await uploadGateway(file);
    await fetchDaily(date);
  };

  const onOpenAdjust = (ref?: string) => {
    setAdjustDefaultRef(ref);
    setShowAdjust(true);
  };

  const onCreateAdjustment = async (payload: {
    date: string;
    ref?: string;
    reason: string;
    amount: number;
    side: 'BANK' | 'GATEWAY';
  }) => {
    await createAdjustment(payload);
    setShowAdjust(false);
    await fetchDaily(date);
  };

  return (
    <div className="px-4 md:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl md:text-2xl font-semibold">Finance → Reconciliation</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 border rounded-lg px-3 h-10">
            <CalendarClock className="h-4 w-4 opacity-70" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="outline-none text-sm"
            />
          </div>
          <button
            onClick={() => fetchDaily(date)}
            className="inline-flex items-center gap-2 h-10 px-3 rounded-lg border hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            onClick={() => onOpenAdjust()}
            className="inline-flex items-center gap-2 h-10 px-3 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            title="New Adjustment"
          >
            <Plus className="h-4 w-4" /> Adjustment
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
        <StatCard label="Bank Total" value={totals.bank} prefix="₹" />
        <StatCard label="Gateway Total" value={totals.gateway} prefix="₹" />
        <StatCard label="Net Difference" value={totals.diff} prefix="₹" emphasize />
        <StatCard
          label="Matched / Mismatched"
          value={`${totals.matchedCount} / ${totals.mismatchedCount}`}
          icon={<FileText className="h-4 w-4" />}
        />
      </div>

      {/* Uploads */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
        <UploadCard
          title="Upload Bank Statement"
          subtitle="CSV/XLSX from bank"
          icon={<Upload className="h-5 w-5" />}
          onUpload={onUploadBank}
        />
        <UploadCard
          title="Upload Gateway Report"
          subtitle="CSV from Razorpay/Stripe"
          icon={<Upload className="h-5 w-5" />}
          onUpload={onUploadGateway}
        />
      </div>

      {/* Table */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Daily Reconciliation — {date}</h2>
          <div className="text-sm text-slate-600">
            {loading ? 'Loading…' : err ? <span className="text-rose-600">{err}</span> : null}
          </div>
        </div>
        <ReconTable rows={data?.rows ?? []} onAdjust={(ref) => onOpenAdjust(ref)} />
      </div>

      {/* Adjustment Modal */}
      {showAdjust && (
        <AdjustmentModal
          date={date}
          defaultRef={adjustDefaultRef}
          onClose={() => setShowAdjust(false)}
          onSubmit={onCreateAdjustment}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  prefix,
  emphasize,
  icon,
}: {
  label: string;
  value: number | string;
  prefix?: string;
  emphasize?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm text-slate-600 flex items-center gap-2">
        {icon}
        {label}
      </div>
      <div className={`mt-2 text-xl font-semibold ${emphasize ? 'text-rose-600' : ''}`}>
        {typeof value === 'number' && prefix ? `${prefix}${value.toLocaleString('en-IN')}` : String(value)}
      </div>
    </div>
  );
}
