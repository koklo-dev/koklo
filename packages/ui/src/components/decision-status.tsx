import type { HTMLAttributes } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { PILL_TONE, STATUS_PILL } from "./status-pill.ts";

export type DecisionStatusValue = "proposee" | "acceptee" | "remplacee";

/** Libellés écrits des trois statuts d'une décision (ADR) : la couleur ne porte jamais le sens seule. */
export const DECISION_STATUS_LABELS: Record<DecisionStatusValue, string> = {
  acceptee: "Acceptée",
  proposee: "Proposée",
  remplacee: "Remplacée",
};

const DECISION: Record<DecisionStatusValue, { icon: IconName; tone: string }> = {
  acceptee: { icon: "check_circle", tone: PILL_TONE.success },
  proposee: { icon: "schedule", tone: PILL_TONE.warning },
  remplacee: { icon: "swap_horiz", tone: PILL_TONE.outline },
};

export type DecisionStatusProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  status: DecisionStatusValue;
};

/**
 * Statut d'une décision d'architecture (DESIGN.md §5.24, maquette 13 l.600) : pastille de la famille des statuts,
 * Acceptée `success`, Proposée `warning`, Remplacée `outline`, libellé toujours écrit.
 */
export function DecisionStatus({ status, className, ...props }: DecisionStatusProps) {
  const { icon, tone } = DECISION[status];
  return (
    <span
      data-slot="decision-status"
      data-status={status}
      className={cn(STATUS_PILL, tone, className)}
      {...props}
    >
      <Icon name={icon} size={16} fill />
      {DECISION_STATUS_LABELS[status]}
    </span>
  );
}
