"use client";

import { type ComponentProps, createContext, type ReactNode, useContext, useId } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import type { ShellLink } from "./app-shell.tsx";

/** Le dernier groupe empilé laisse le cadre fermer la liste (pas de double ligne). */
const LIST = "m-0 list-none p-0 [&>li:last-child>[data-slot=group-section]]:border-b-0";

/** Gabarit des lignes d'un `ListPanel` : lu par `ListRow` pour ses marges et son retour à la ligne. */
const DensityContext = createContext<"compact" | "comfortable">("compact");

export interface ListPanelProps extends Omit<ComponentProps<"section">, "title"> {
  /** Titre visible (h2) ; nomme la section. */
  title?: string;
  /** Nom de la section quand il n'y a pas de titre visible. */
  label?: string;
  /** Lien « Tout voir » de l'en-tête. */
  viewAll?: { href: string; label?: string };
  /** Pied sur `--surface`, 12 atténué. */
  footer?: ReactNode;
  /**
   * `comfortable` (maquette 07 l.151-166) : marges de 20, écart de 14, ligne sous l'en-tête, titres et sous-titres qui
   * passent à la ligne au lieu d'être coupés. `compact` par défaut.
   */
  density?: "compact" | "comfortable";
  LinkComponent?: ShellLink;
}

/** Cadre de lignes (rayon 12, bordure) : en-tête facultatif, liste, pied facultatif (DESIGN.md §5.7). */
export function ListPanel({
  title,
  label,
  viewAll,
  footer,
  density = "compact",
  LinkComponent: Link = "a" as unknown as ShellLink,
  className,
  children,
  ...props
}: ListPanelProps) {
  const titleId = useId();
  const roomy = density === "comfortable";
  return (
    <DensityContext.Provider value={density}>
      <section
        data-slot="list-panel"
        data-density={density}
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        className={cn("overflow-hidden rounded-xl border bg-background", className)}
        {...props}
      >
        {title || viewAll ? (
          <div
            className={cn(
              "flex items-center justify-between gap-3",
              roomy ? "border-b px-5 py-3.5" : "px-4 py-3",
            )}
          >
            {title ? (
              <h2 id={titleId} className="text-section-title text-foreground">
                {title}
              </h2>
            ) : null}
            {viewAll ? (
              <Link
                href={viewAll.href}
                className="ml-auto inline-flex items-center gap-1 rounded-sm text-meta font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {viewAll.label ?? "Tout voir"}
                <Icon name="arrow_forward" size={16} />
              </Link>
            ) : null}
          </div>
        ) : null}
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari retire la sémantique de liste de `list-none` */}
        <ul role="list" className={LIST}>
          {children}
        </ul>
        {footer ? (
          <div
            className={cn(
              "border-t bg-surface text-caption font-normal text-muted-foreground",
              roomy ? "px-5 py-2.5" : "px-4 py-2",
            )}
          >
            {footer}
          </div>
        ) : null}
      </section>
    </DensityContext.Provider>
  );
}

export interface ListRowProps {
  /**
   * `li` (défaut) : ligne d'un `ListPanel`. `div` : contenu de ligne seul, sans bordure ni marge, pour un hôte qui
   * pose déjà son `li` (`VirtualList`).
   */
  as?: "li" | "div";
  title: ReactNode;
  subtitle?: ReactNode;
  /** Icône d'état ou identifiant en tête. */
  leading?: ReactNode;
  /** Pastille, valeur ou actions à droite : hors de la zone cliquable de la ligne. */
  trailing?: ReactNode;
  selected?: boolean;
  /** Ligne de 52 de haut. */
  fixedHeight?: boolean;
  href?: string;
  onSelect?: () => void;
  LinkComponent?: ShellLink;
  className?: string;
}

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/** Ligne d'un `ListPanel` (ou, avec `as="div"`, contenu d'une ligne de `VirtualList`) : lien, bouton ou statique. */
export function ListRow({
  as: Tag = "li",
  title,
  subtitle,
  leading,
  trailing,
  selected,
  fixedHeight,
  href,
  onSelect,
  LinkComponent: Link = "a" as unknown as ShellLink,
  className,
}: ListRowProps) {
  const roomy = useContext(DensityContext) === "comfortable";
  const clip = roomy ? undefined : "truncate";
  const body = (
    <>
      {leading}
      <span className={cn("flex min-w-0 flex-1 flex-col text-left", roomy && "leading-[1.3]")}>
        <span className={cn(clip, "text-body font-medium text-foreground")}>{title}</span>
        {subtitle ? (
          <span className={cn(clip, "text-caption font-normal text-muted-foreground")}>
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );
  const gap = roomy ? "gap-3.5" : "gap-3";
  const main = cn("flex min-w-0 flex-1 items-center self-stretch", gap, FOCUS);
  const current = selected ? ("true" as const) : undefined;
  const inPanel = Tag === "li";
  return (
    <Tag
      data-slot="list-row"
      className={cn(
        "flex items-center",
        gap,
        inPanel ? cn("border-t first:border-t-0", roomy ? "px-5" : "px-4") : "min-w-0 flex-1",
        fixedHeight ? "h-[52px]" : inPanel && "py-3",
        selected && "bg-secondary",
        className,
      )}
    >
      {href ? (
        <Link href={href} aria-current={current} className={main}>
          {body}
        </Link>
      ) : onSelect ? (
        <button type="button" onClick={onSelect} aria-current={current} className={main}>
          {body}
        </button>
      ) : (
        <div aria-current={current} className={cn("flex min-w-0 flex-1 items-center", gap)}>
          {body}
        </div>
      )}
      {trailing}
    </Tag>
  );
}
