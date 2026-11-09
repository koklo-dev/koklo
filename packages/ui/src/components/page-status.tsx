import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import type { ShellLink } from "./app-shell.tsx";
import { Pill } from "./pill.tsx";

export type PageStatusValue = "empty" | "draft" | "review" | "stable";

export const PAGE_STATUS_LABEL: Record<PageStatusValue, string> = {
  stable: "Stable",
  review: "À relire",
  draft: "Brouillon",
  empty: "À explorer",
};

const ICON: Record<PageStatusValue, { name: IconName; fill: boolean; className: string }> = {
  stable: { name: "check_circle", fill: true, className: "text-status-validated-foreground" },
  review: { name: "rate_review", fill: false, className: "text-primary" },
  draft: { name: "edit", fill: false, className: "text-muted-foreground" },
  empty: { name: "radio_button_unchecked", fill: false, className: "text-border-strong" },
};

/**
 * Icône d'état d'une page (DESIGN.md §5.8) ; avec `showLabel`, le libellé la suit. Avec `pill`, la pastille `soft` de
 * l'en-tête du document (icône 16 et libellé). Jamais la couleur seule.
 */
export function PageStatus({
  status,
  size = 18,
  showLabel = false,
  pill = false,
  className,
}: {
  status: PageStatusValue;
  size?: 16 | 18;
  showLabel?: boolean;
  pill?: boolean;
  className?: string;
}) {
  const icon = ICON[status];
  if (pill) {
    return (
      <Pill
        tone="soft"
        icon={icon.name}
        data-status={status}
        className={cn("pl-2 text-foreground", className)}
      >
        {PAGE_STATUS_LABEL[status]}
      </Pill>
    );
  }
  return (
    <span
      data-slot="page-status"
      data-status={status}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <Icon
        name={icon.name}
        size={size}
        fill={icon.fill}
        className={icon.className}
        title={showLabel ? undefined : PAGE_STATUS_LABEL[status]}
      />
      {showLabel ? <span>{PAGE_STATUS_LABEL[status]}</span> : null}
    </span>
  );
}

/** Légende des états (encadré `--surface`, 12/400, icônes `currentColor`, stable pleine) sous l'arborescence. */
export function StatusLegend({ className }: { className?: string }) {
  const order: PageStatusValue[] = ["stable", "review", "draft", "empty"];
  return (
    <ul
      data-slot="status-legend"
      aria-label="Légende des états"
      className={cn(
        "m-0 mt-3 flex list-none flex-col gap-1.5 rounded-lg bg-surface p-2.5 text-caption font-normal text-muted-foreground",
        className,
      )}
    >
      {order.map((status) => (
        <li key={status} className="flex items-center gap-1.5 leading-[18px]">
          <Icon name={ICON[status].name} size={16} fill={status === "stable"} />
          {PAGE_STATUS_LABEL[status]}
        </li>
      ))}
    </ul>
  );
}

/** Étiquette d'une ligne de l'arborescence (10/600, bordure, rayon 4) : « requise » par défaut, « générée » pour la Synthèse. */
export function RequiredTag({ label = "requise", title }: { label?: string; title?: string }) {
  return (
    <span
      title={title ?? (label === "requise" ? "Page requise pour passer au cadrage" : undefined)}
      className="rounded-[4px] border border-border px-1 text-[10px] font-semibold leading-4 text-muted-foreground"
    >
      {label}
    </span>
  );
}

export interface PageNavItemProps {
  href: string;
  /** Titre numéroté (« 05 · Périmètre »). */
  title: string;
  status: PageStatusValue;
  required?: boolean;
  current?: boolean;
  /** Une proposition de l'agent attend une décision sur cette page : pastille de 7 px (TK-90, B225). */
  pending?: boolean;
  LinkComponent?: ShellLink;
  linkProps?: AnchorHTMLAttributes<HTMLAnchorElement>;
  /** Actions de la ligne (menu de page) : après le lien, hors de celui-ci. */
  actions?: ReactNode;
}

/** Ligne d'arborescence : 34 px, icône d'état, titre, étiquette « requise » ; la page courante prend `--secondary`. */
export function PageNavItem({
  href,
  title,
  status,
  required = false,
  current = false,
  pending = false,
  LinkComponent: Link = "a" as unknown as ShellLink,
  linkProps,
  actions,
}: PageNavItemProps) {
  return (
    <div className="group/row relative flex min-w-0 flex-1 items-center">
      <Link
        {...linkProps}
        href={href}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex min-h-[34px] min-w-0 flex-1 items-center gap-2 rounded-md py-0 pr-2 pl-0 text-meta hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-11",
          current && "bg-secondary font-semibold",
          linkProps?.className,
        )}
      >
        <PageStatus status={status} />
        <span
          className={cn("min-w-0 flex-1 truncate", status === "empty" && "text-muted-foreground")}
        >
          {title}
        </span>
        {required ? <RequiredTag /> : null}
        {pending ? (
          <span
            role="img"
            aria-label="Proposition en attente"
            className="size-[7px] shrink-0 rounded-full bg-primary"
          />
        ) : null}
      </Link>
      {actions ? (
        <div
          data-slot="page-nav-actions"
          className="absolute inset-y-0 right-0 flex items-center lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover/row:opacity-100 lg:has-[[data-state=open]]:opacity-100"
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Ligne « Synthèse » (maquette 06 l.74, DESIGN.md §5.10) : première de l'arborescence, hors liste réordonnable. 34 px,
 * bordure, rayon 6, icône `wand_stars` 18, étiquette « générée ». Ni poignée, ni menu, ni statut.
 */
export function SynthesisNavItem({
  href,
  current = false,
  label = "Synthèse",
  tag = "générée",
  LinkComponent: Link = "a" as unknown as ShellLink,
  linkProps,
}: {
  href: string;
  current?: boolean;
  label?: string;
  /** Étiquette à droite ; `null` pour ne rien afficher. */
  tag?: string | null;
  LinkComponent?: ShellLink;
  linkProps?: AnchorHTMLAttributes<HTMLAnchorElement>;
}) {
  return (
    <Link
      {...linkProps}
      href={href}
      data-slot="synthesis-nav-item"
      aria-current={current ? "page" : undefined}
      className={cn(
        "mb-1.5 flex min-h-9 min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 text-meta hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-11",
        current && "bg-secondary font-semibold",
        linkProps?.className,
      )}
    >
      <Icon name="wand_stars" size={18} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {tag ? <RequiredTag label={tag} /> : null}
    </Link>
  );
}
