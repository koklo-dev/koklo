"use client";

import { cva } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { primeIcon } from "../icons/cache.ts";
import * as checkCircle from "../icons/generated/check_circle.ts";
import * as editNote from "../icons/generated/edit_note.ts";
import * as schedule from "../icons/generated/schedule.ts";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

// Les trois icônes de statut sont toujours visibles : elles sont rendues sans attente.
primeIcon("check_circle", checkCircle);
primeIcon("schedule", schedule);
primeIcon("edit_note", editNote);

export type Status = "validated" | "pending" | "revise";

const STATUS_ICON: Record<Status, IconName> = {
  validated: "check_circle",
  pending: "schedule",
  revise: "edit_note",
};

const statusVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 font-medium", {
  variants: {
    status: {
      validated: "bg-status-validated text-status-validated-foreground",
      pending: "bg-status-pending text-status-pending-foreground",
      revise: "bg-status-revise text-status-revise-foreground",
    },
    size: { default: "h-6 text-xs", lg: "h-7 text-sm" },
  },
  defaultVariants: { size: "default" },
});

export interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  status: Status;
  /** Libellé texte obligatoire : un statut ne se lit jamais par la couleur seule. */
  label: string;
  size?: "default" | "lg";
}

/** Statut Validée / À valider / À revoir : icône pleine, libellé et couleur status-*. */
export function StatusBadge({
  status,
  label,
  size = "default",
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <span className={cn(statusVariants({ status, size }), className)} {...props}>
      <Icon name={STATUS_ICON[status]} size={size === "lg" ? 18 : 16} fill />
      {label}
    </span>
  );
}
