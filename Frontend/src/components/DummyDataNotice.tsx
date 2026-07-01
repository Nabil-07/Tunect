import { Info } from 'lucide-react';
import { DUMMY_DATA_NOTICE } from '../config/siteShutdown';

export default function DummyDataNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      className="mb-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
      data-testid="dummy-data-notice"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      <span>{DUMMY_DATA_NOTICE}</span>
    </div>
  );
}
