"use client";

import { cva } from "class-variance-authority";
import { type HTMLAttributes, type ReactNode, useId, useState } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";

export type InlineAlertVariant =
  | "neutral"
  | "success"
  | "agent"
  | "warning"
  | "error"
  | "revise"
  | "validated";

/** Rôle dérivé de la variante : information, attente (compte à rebours), échec. */
const ROLE: Record<InlineAlertVariant, "note" | "status" | "alert"> = {
  neutral: "note",
  success: "status",
  agent: "status",
  warning: "status",
  error: "alert",
  /** Demande de changement enregistrée : une confirmation, pas une erreur (TK-104). */
  revise: "status",
  /** Décision validée enregistrée (TK-104). */
  validated: "status",
};

/** Confirmations de décision (maquette 10 l.312, 328, 440-441) : fond plein du statut, sans bordure, 14 px, icône pleine. */
const SOLID: ReadonlySet<InlineAlertVariant> = new Set(["revise", "validated"]);

const inlineAlertVariants = cva("flex min-h-10 flex-col rounded-card border text-meta", {
  variants: {
    variant: {
      neutral: "border-alert-neutral-border bg-alert-neutral text-alert-neutral-foreground",
      success: "border-alert-success-border bg-alert-success text-alert-success-foreground",
      agent: "border-dashed border-primary bg-diff-bg text-foreground",
      warning: "border-alert-warning-border bg-alert-warning text-alert-warning-foreground",
      error: "border-alert-error-border bg-alert-error text-alert-error-foreground",
      revise: "border-transparent bg-status-revise text-status-revise-foreground text-sm",
      validated: "border-transparent bg-status-validated text-status-validated-foreground text-sm",
    },
  },
});

/** Bouton texte souligné, 600, 28 px de haut (≥ 24 px, 2.5.8), couleur héritée de la variante. */
const ACTION =
  "inline-flex h-7 shrink-0 items-center rounded-md px-2.5 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Ton neutre ou agent : le bouton prend le contour ; ton coloré : il hérite de la couleur du texte. */
const NEUTRAL_TONES: ReadonlySet<InlineAlertVariant> = new Set(["neutral", "agent"]);

export type InlineAlertAction = { label: string; onClick: () => void };

type Common = Omit<HTMLAttributes<HTMLDivElement>, "role" | "children"> & {
  variant: InlineAlertVariant;
  icon: IconName;
  children: ReactNode;
  /** Remplace le rôle dérivé de la variante (un avertissement fixe, sans annonce, est une `note`). */
  role?: "note" | "status" | "alert";
};

export type InlineAlertProps = Common &
  (
    | {
        action?: InlineAlertAction;
        actions?: never;
        details?: never;
        detailsLabel?: never;
        defaultOpen?: never;
      }
    | {
        action?: never;
        /** Un ou deux boutons `sm` (DESIGN.md §5.6), à la place du lien. */
        actions: [InlineAlertAction] | [InlineAlertAction, InlineAlertAction];
        details?: never;
        detailsLabel?: never;
        defaultOpen?: never;
      }
    | {
        action?: never;
        actions?: never;
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
  actions,
  details,
  detailsLabel = "Détails",
  defaultOpen = false,
  className,
  role,
  ...props
}: InlineAlertProps) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  const hasDetails = details !== undefined;
  return (
    <div
      data-slot="inline-alert"
      data-variant={variant}
      role={role ?? ROLE[variant]}
      className={cn(inlineAlertVariants({ variant }), className)}
      {...props}
    >
      <div
        className={cn(
          "flex flex-1 items-center gap-2.5 py-1.5 pr-2 pl-3",
          actions && "max-md:flex-wrap",
        )}
      >
        <Icon name={icon} size={18} fill={SOLID.has(variant)} className="shrink-0" />
        <div className="min-w-0 flex-1 py-1">{children}</div>
        {action ? (
          <button type="button" className={ACTION} onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
        {actions ? (
          <span className="flex flex-wrap items-center gap-2 md:shrink-0 max-md:basis-full max-md:pb-1 max-md:pl-7">
            {actions.map((item) => (
              <Button
                key={item.label}
                size="sm"
                variant={NEUTRAL_TONES.has(variant) ? "outline" : "inherit"}
                onClick={item.onClick}
              >
                {item.label}
              </Button>
            ))}
          </span>
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
