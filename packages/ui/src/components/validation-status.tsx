"use client";

import type { HTMLAttributes } from "react";
import { primeIcon } from "../icons/cache.ts";
import * as block from "../icons/generated/block.ts";
import * as cancel from "../icons/generated/cancel.ts";
import * as checkCircle from "../icons/generated/check_circle.ts";
import * as editNote from "../icons/generated/edit_note.ts";
import * as remove from "../icons/generated/remove.ts";
import * as schedule from "../icons/generated/schedule.ts";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { STATUS_PILL, STATUS_TONE } from "./status-pill.ts";

// Icônes de statut toujours visibles : rendues sans attente.
primeIcon("check_circle", checkCircle);
primeIcon("schedule", schedule);
primeIcon("edit_note", editNote);
primeIcon("remove", remove);
primeIcon("cancel", cancel);
primeIcon("block", block);

export type ValidationStatusValue = "validated" | "pending" | "revise" | "unsubmitted";

const ICON: Record<ValidationStatusValue, IconName> = {
  validated: "check_circle",
  pending: "schedule",
  revise: "edit_note",
  unsubmitted: "remove",
};

const LABEL: Record<ValidationStatusValue, string> = {
  validated: "Validée",
  pending: "À valider",
  revise: "À revoir",
  unsubmitted: "Non soumise",
};

type Common = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  /** Libellé propre à l'écran (proposition, installation), tonalité la plus proche (B25). */
  label?: string;
  /** `lg` : conservé pour l'alias `StatusBadge` des écrans non refondus. */
  size?: "default" | "lg";
};

export type ValidationStatusProps = Common &
  (
    | { status: Exclude<ValidationStatusValue, "unsubmitted">; icon?: never }
    | {
        status: "unsubmitted";
        /** Rejet (`cancel`) ou suspension (`block`) ; aucune autre icône. */
        icon?: "cancel" | "block";
      }
  );

/** Validation client (DESIGN.md v2 §2.2, §5.1) : icône pleine, libellé toujours présent, jamais la marque. */
export function ValidationStatus({
  status,
  label,
  icon,
  size = "default",
  className,
  ...props
}: ValidationStatusProps) {
  return (
    <span
      data-slot="validation-status"
      data-status={status}
      className={cn(STATUS_PILL, STATUS_TONE[status], size === "lg" && "h-7 text-sm", className)}
      {...props}
    >
      <Icon name={icon ?? ICON[status]} size={size === "lg" ? 18 : 16} fill />
      {label ?? LABEL[status]}
    </span>
  );
}
