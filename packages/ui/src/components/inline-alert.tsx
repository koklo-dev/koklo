"use client";

import { cva } from "class-variance-authority";
import { type HTMLAttributes, type ReactNode, useId, useState } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

export type InlineAlertVariant = "neutral" | "warning" | "error";

/** Rôle dérivé de la variante : information, attente (compte à rebours), échec. */
const ROLE: Record<InlineAlertVariant, "note" | "status" | "alert"> = {
  neutral: "note",
  warning: "status",
  error: "alert",
};

const inlineAlertVariants = cva("flex min-h-10 flex-col rounded-lg border text-meta", {
  variants: {
    variant: {
      neutral: "border-alert-neutral-border bg-alert-neutral text-alert-neutral-foreground",
      warning: "border-alert-warning-border bg-alert-warning text-alert-warning-foreground",
      error: "border-alert-error-border bg-alert-error text-alert-error-foreground",
    },
  },
});

/** Bouton texte souligné, 600, 28 px de haut (≥ 24 px, 2.5.8), couleur héritée de la variante. */
const ACTION =
  "inline-flex h-7 shrink-0 items-center rounded-sm px-1 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Common = Omit<HTMLAttributes<HTMLDivElement>, "role" | "children"> & {
  variant: InlineAlertVariant;
  icon: IconName;
  children: ReactNode;
};

export type InlineAlertProps = Common &
  (
    | {
        action?: { label: string; onClick: () => void };
        details?: never;
        detailsLabel?: never;
        defaultOpen?: never;
      }
    | {
        action?: never;
        /** Détail dépliable sous la ligne : « Détails » est alors la seule action. */
        details: ReactNode;
        detailsLabel?: string;
        defaultOpen?: boolean;
      }
  );

/** Alerte d'une ligne (DESIGN.md v2 §5.1) : 40 px au moins, icône 18 px, texte, une action facultative. */
export function InlineAlert({
  variant,
  icon,
  children,
  action,
  details,
  detailsLabel = "Détails",
  defaultOpen = false,
  className,
  ...props
}: InlineAlertProps) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  const hasDetails = details !== undefined;
  return (
    <div
      data-slot="inline-alert"
      data-variant={variant}
      role={ROLE[variant]}
      className={cn(inlineAlertVariants({ variant }), className)}
      {...props}
    >
      <div className="flex flex-1 items-start gap-2 py-1.5 pr-2 pl-3">
        <Icon name={icon} size={18} className="mt-[5px]" />
        <div className="min-w-0 flex-1 py-1">{children}</div>
        {action ? (
          <button type="button" className={ACTION} onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
        {hasDetails ? (
          <button
            type="button"
            className={ACTION}
            aria-expanded={open}
            aria-controls={regionId}
            onClick={() => setOpen((value) => !value)}
          >
            {detailsLabel}
          </button>
        ) : null}
      </div>
      {hasDetails && open ? (
        <div id={regionId} className="border-t border-inherit px-3 py-2.5">
          {details}
        </div>
      ) : null}
    </div>
  );
}
