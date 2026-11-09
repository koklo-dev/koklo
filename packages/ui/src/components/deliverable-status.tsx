"use client";

import type { HTMLAttributes } from "react";
import { primeIcon } from "../icons/cache.ts";
import * as checkCircle from "../icons/generated/check_circle.ts";
import * as edit from "../icons/generated/edit.ts";
import * as editNote from "../icons/generated/edit_note.ts";
import * as radioButtonUnchecked from "../icons/generated/radio_button_unchecked.ts";
import * as schedule from "../icons/generated/schedule.ts";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { STATUS_PILL, STATUS_TONE } from "./status-pill.ts";

// Icônes de statut toujours visibles : rendues sans attente.
primeIcon("radio_button_unchecked", radioButtonUnchecked);
primeIcon("edit", edit);
primeIcon("schedule", schedule);
primeIcon("check_circle", checkCircle);
primeIcon("edit_note", editNote);

export type DeliverableStatusValue = "todo" | "in_progress" | "pending" | "revise" | "validated";

const DELIVERABLE: Record<
  DeliverableStatusValue,
  { label: string; icon: IconName; tone: keyof typeof STATUS_TONE }
> = {
  todo: { label: "À faire", icon: "radio_button_unchecked", tone: "neutral" },
  in_progress: { label: "En cours", icon: "edit", tone: "neutral" },
  pending: { label: "À valider", icon: "schedule", tone: "pending" },
  revise: { label: "À revoir", icon: "edit_note", tone: "revise" },
  validated: { label: "Validé", icon: "check_circle", tone: "validated" },
};

type Common = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  status: DeliverableStatusValue;
};

export type DeliverableStatusProps = Common &
  (
    | { compact?: false; hideLabel?: never }
    | {
        compact: true;
        /** Libellé masqué à l'écran, toujours lu par les lecteurs d'écran (barre latérale du lot 1). */
        hideLabel?: boolean;
      }
  );

/** Statut d'un livrable du cadrage (DESIGN.md v2 §5.1) : même gabarit que `ValidationStatus`. */
export function DeliverableStatus({
  status,
  compact = false,
  hideLabel = false,
  className,
  ...props
}: DeliverableStatusProps) {
  const { label, icon, tone } = DELIVERABLE[status];
  return (
    <span
      data-slot="deliverable-status"
      data-status={status}
      className={cn(
        STATUS_PILL,
        STATUS_TONE[tone],
        compact && "text-[11px]",
        hideLabel && "px-1",
        className,
      )}
      {...props}
    >
      <Icon name={icon} size={16} fill={tone !== "neutral"} />
      <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
    </span>
  );
}
