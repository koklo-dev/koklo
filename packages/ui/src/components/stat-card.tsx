import type { ComponentProps } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Card } from "./card.tsx";
import { ProgressBar } from "./progress-bar.tsx";

export type StatCardProps = Omit<ComponentProps<"div">, "children"> & {
  label: string;
  value: string;
  icon?: IconName;
  note?: string;
  /** Jauge facultative : `label` est son nom accessible. */
  gauge?: { value: number; label: string };
};

/** Carte de chiffre (DESIGN.md §5.6) : libellé et icône, valeur `text-stat`, jauge et note facultatives. */
export function StatCard({ label, value, icon, note, gauge, className, ...props }: StatCardProps) {
  return (
    <Card
      data-slot="stat-card"
      className={cn("flex flex-col gap-1 px-4 py-3.5", className)}
      {...props}
    >
      <span className="flex items-center gap-1.5 text-meta text-muted-foreground">
        {icon ? <Icon name={icon} size={18} /> : null}
        {label}
      </span>
      <span className="text-stat">{value}</span>
      {gauge ? <ProgressBar value={gauge.value} aria-label={gauge.label} className="my-1" /> : null}
      {note ? <span className="text-caption font-normal text-muted-foreground">{note}</span> : null}
    </Card>
  );
}
