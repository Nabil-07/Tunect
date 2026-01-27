import { Skeleton } from './Skeleton';

/**
 * Matches token balance card: rounded-lg p-6 border, avatar + name, 3 detail rows, button.
 * Preserves card height for grid layout (md:grid-cols-2).
 */
export function TokenBalanceSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-4 mb-4">
        <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
        <Skeleton className="h-5 w-32 flex-1" />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-14" />
        </div>
        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
      <Skeleton className="mt-4 h-10 w-full rounded-lg" />
    </div>
  );
}

export default TokenBalanceSkeleton;
