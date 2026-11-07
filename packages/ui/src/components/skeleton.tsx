import { cn } from "../lib/cn.ts";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("motion-safe:animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  );
}

/** Largeurs de la barre de ligne, en cycle (DESIGN.md §5.6). */
const BAR_WIDTHS = [60, 45, 70, 52] as const;

export type SkeletonRowProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** Rang de la ligne : choisit la largeur de la barre (60, 45, 70 puis 52 %). */
  index?: number;
};

/** Ligne de liste en chargement : 52 px, pavé 48 × 18 et barre de 14, masquée aux lecteurs d'écran. */
function SkeletonRow({ index = 0, className, ...props }: SkeletonRowProps) {
  const width = BAR_WIDTHS[Math.abs(index) % BAR_WIDTHS.length];
  return (
    <div
      data-slot="skeleton-row"
      aria-hidden="true"
      className={cn("flex h-[52px] items-center gap-3 px-4", className)}
      {...props}
    >
      <Skeleton className="h-[18px] w-12 shrink-0 bg-surface" />
      <Skeleton className="h-3.5 bg-surface" style={{ width: `${width}%` }} />
    </div>
  );
}

export { Skeleton, SkeletonRow };
