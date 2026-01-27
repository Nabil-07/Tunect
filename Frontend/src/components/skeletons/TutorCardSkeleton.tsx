import { Skeleton } from './Skeleton';

/**
 * Matches TutorCard: rounded-2xl, border, h-36 image + p-4 content.
 * Preserves full card height to avoid layout shift.
 */
export function TutorCardSkeleton() {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <Skeleton className="h-36 w-full rounded-none rounded-t-2xl" />
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-28 sm:w-32" />
            <div className="mt-1 flex items-center gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-6 w-14 sm:w-16" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-9 flex-1 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>
    </article>
  );
}

export default TutorCardSkeleton;
