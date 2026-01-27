// Reusable base skeleton using Tailwind animate-pulse.
// Preserves layout (height/width) to avoid shift when content loads.

export type SkeletonProps = {
  /** Optional fixed height (e.g. "h-8", "h-36") */
  className?: string;
  /** Inline height for exact match (preserves layout) */
  style?: React.CSSProperties;
};

export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`animate-pulse rounded-xl bg-slate-200 ${className}`.trim()}
      style={style}
    />
  );
}

export default Skeleton;
