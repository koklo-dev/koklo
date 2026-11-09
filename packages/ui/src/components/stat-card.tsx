import type { ComponentProps } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Card } from "./card.tsx";
import { ProgressBar } from "./progress-bar.tsx";
import { SegmentedGauge } from "./segmented-gauge.tsx";

export type StatCardProps = Omit<ComponentProps<"div">, "children"> & {
  label: string;
  value: string;
  icon?: IconName;
  note?: string;
  /** Jauge facultative : `label` est son nom accessible. */
  gauge?: { value: number; label: string };
  /** Jauge à crans (`SegmentedGauge`, DESIGN.md §5.11) : décorative, la valeur est écrite en `value` et `note`. */
  segments?: { done: number; total: number };
  /** `comfortable` : marges 16 / 18, écart 8, valeur 26 et note 13 (maquette 07 l.115-120) ; `compact` par défaut. */
  density?: "compact" | "comfortable";
};

/** Carte de chiffre (DESIGN.md §5.6) : libellé et icône, valeur `text-stat`, jauge et note facultatives. */
export function StatCard({
  label,
  value,
  icon,
  note,
  gauge,
  segments,
  density = "compact",
  className,
  ...props
}: StatCardProps) {
  const roomy = density === "comfortable";
  return (
    <Card
      data-slot="stat-card"
      data-density={density}
      className={cn("flex flex-col", roomy ? "gap-2" : "gap-1 px-4 py-3.5", className)}
      {...props}
    >
      <span
        className={cn(
          "flex items-center text-meta text-muted-foreground",
          roomy ? "gap-2" : "gap-1.5",
        )}
      >
        {icon ? <Icon name={icon} size={18} /> : null}
        {label}
      </span>
      <span className={cn("text-stat", roomy && "text-[26px] leading-[1.1]")}>{value}</span>
      {gauge ? (
        <ProgressBar
          value={gauge.value}
          aria-label={gauge.label}
          className={roomy ? undefined : "my-1"}
        />
      ) : null}
      {segments ? (
        <SegmentedGauge
          done={segments.done}
          total={segments.total}
          className={roomy ? undefined : "my-1"}
        />
      ) : null}
      {note ? (
        <span
          className={cn("font-normal text-muted-foreground", roomy ? "text-meta" : "text-caption")}
        >
          {note}
        </span>
      ) : null}
    </Card>
  );
}
