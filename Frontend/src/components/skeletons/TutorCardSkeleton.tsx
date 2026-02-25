import { Skeleton } from './Skeleton';

/**
 * Matches TutorCard: rounded-2xl, border, h-36 image + p-4 content.
 * Preserves full card height to avoid layout shift.
 */
export function TutorCardSkeleton() {
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden h-full">
      {/* Hero */}
      <Skeleton className="h-36 w-full rounded-none rounded-t-2xl flex-shrink-0" />
      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        {/* Name & Price */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-28 sm:w-32" />
            <div className="mt-1 flex items-center gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-6 w-16 sm:w-20" />
        </div>
        {/* Boards placeholder */}
        <div className="mt-3 flex gap-1.5">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        {/* Teaches section placeholder */}
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 min-h-[4.5rem]">
          <Skeleton className="h-3 w-14" />
          <div className="mt-2 space-y-1.5">
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </div>
        </div>
        {/* Languages placeholder */}
        <div className="mt-2 flex gap-1.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        {/* Spacer */}
        <div className="flex-1" />
        {/* Buttons */}
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 flex-1 rounded-xl" />
        </div>
      </div>
    </article>
  );
}

export default TutorCardSkeleton;
