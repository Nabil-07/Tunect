import { Skeleton } from './Skeleton';

/**
 * Matches BookingCard: rounded-xl p-5 border, flex col md:row.
 * Preserves approximate row height to avoid layout shift.
 */
export function BookingRowSkeleton() {
  return (
    <div className="bg-white shadow rounded-xl p-5 border border-slate-200">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2 min-w-0 flex-1">
          <Skeleton className="h-5 w-36 sm:w-44" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 md:flex-shrink-0">
          <Skeleton className="h-9 w-full sm:w-28 rounded-xl" />
          <Skeleton className="h-9 w-full sm:w-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default BookingRowSkeleton;
