import { Skeleton } from './Skeleton';

/**
 * Matches StatCard / SnapshotCard: rounded-xl sm:rounded-2xl, border, p-4 sm:p-5.
 * Preserves h-36 sm:h-40 to avoid layout shift.
 */
export function DashboardStatSkeleton() {
  return (
    <div className="h-36 sm:h-40 rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm flex flex-col">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24 sm:w-28" />
        <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
      </div>
      <Skeleton className="mt-2 sm:mt-3 h-7 w-20 sm:h-8 sm:w-24" />
      <div className="mt-auto flex gap-2 pt-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export default DashboardStatSkeleton;
