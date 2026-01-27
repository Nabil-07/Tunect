import { Skeleton } from './Skeleton';

type TableRowSkeletonProps = {
  /** Number of columns (default 6: Student, Grade, Tokens, Status, Created, Actions) */
  columns?: number;
};

/**
 * Matches admin students table row: px-4 py-3 cells.
 * Preserves row height to avoid layout shift.
 */
export function TableRowSkeleton({ columns = 6 }: TableRowSkeletonProps) {
  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          {i === 0 ? (
            <div className="space-y-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          ) : i === columns - 1 ? (
            <Skeleton className="h-8 w-16 rounded-lg" />
          ) : (
            <Skeleton className="h-4 w-12 sm:w-16" />
          )}
        </td>
      ))}
    </tr>
  );
}

export default TableRowSkeleton;
