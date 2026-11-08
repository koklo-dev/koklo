import { type ComponentProps, type ReactNode, useId } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import type { ShellLink } from "./app-shell.tsx";

/** Le dernier groupe empilé laisse le cadre fermer la liste (pas de double ligne). */
const LIST = "m-0 list-none p-0 [&>li:last-child>[data-slot=group-section]]:border-b-0";

export interface ListPanelProps extends Omit<ComponentProps<"section">, "title"> {
  /** Titre visible (h2) ; nomme la section. */
  title?: string;
  /** Nom de la section quand il n'y a pas de titre visible. */
  label?: string;
  /** Lien « Tout voir » de l'en-tête. */
  viewAll?: { href: string; label?: string };
  /** Pied sur `--surface`, 12 atténué. */
  footer?: ReactNode;
  LinkComponent?: ShellLink;
}

/** Cadre de lignes (rayon 12, bordure) : en-tête facultatif, liste, pied facultatif (DESIGN.md §5.7). */
export function ListPanel({
  title,
  label,
  viewAll,
  footer,
  LinkComponent: Link = "a" as unknown as ShellLink,
  className,
  children,
  ...props
}: ListPanelProps) {
  const titleId = useId();
  return (
    <section
      data-slot="list-panel"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
      className={cn("overflow-hidden rounded-xl border bg-background", className)}
      {...props}
    >
      {title || viewAll ? (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
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
        <div className="border-t bg-surface px-4 py-2 text-caption font-normal text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </section>
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
  const body = (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-body font-medium text-foreground">{title}</span>
        {subtitle ? (
          <span className="truncate text-caption font-normal text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );
  const main = cn("flex min-w-0 flex-1 items-center gap-3 self-stretch", FOCUS);
  const current = selected ? ("true" as const) : undefined;
  const inPanel = Tag === "li";
  return (
    <Tag
      data-slot="list-row"
      className={cn(
        "flex items-center gap-3",
        inPanel ? "border-t px-4 first:border-t-0" : "min-w-0 flex-1",
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
        <div aria-current={current} className="flex min-w-0 flex-1 items-center gap-3">
          {body}
        </div>
      )}
      {trailing}
    </Tag>
  );
}
