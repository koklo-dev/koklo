import type { ReactNode, Ref } from "react";
import { cn } from "../lib/cn.ts";
import type { ShellLink } from "./app-shell.tsx";

export interface PageHeaderCrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  /** Fil d'Ariane facultatif ; le dernier segment est la page courante. */
  breadcrumb?: ReadonlyArray<PageHeaderCrumb>;
  /** État à côté du titre (`ValidationStatus`, `DeliverableStatus`…). */
  status?: ReactNode;
  /** Ligne de contexte sous le titre : « Atelier Lumière · 3 projets · 6 membres ». */
  summary?: string;
  actions?: ReactNode;
  headingAs?: "h1" | "h4";
  titleRef?: Ref<HTMLHeadingElement>;
  titleId?: string;
  LinkComponent?: ShellLink;
  className?: string;
}

function Crumbs({ items, Link }: { items: ReadonlyArray<PageHeaderCrumb>; Link: ShellLink }) {
  return (
    <nav aria-label="Fil d'Ariane" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-meta text-muted-foreground">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          const first = i === 0;
          const label =
            item.href && !last ? (
              <Link
                href={item.href}
                className={cn("hover:underline", first && "font-medium text-foreground")}
              >
                {item.label}
              </Link>
            ) : (
              <span className={cn(first && "font-medium text-foreground")}>{item.label}</span>
            );
          return (
            <li
              key={item.label}
              aria-current={last ? "page" : undefined}
              className="flex items-center gap-3"
            >
              {label}
              {last ? null : <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** En-tête de page hors projet (organisation, Réglages) : fil facultatif, titre, état et actions (DESIGN.md §5.4). */
export function PageHeader({
  title,
  breadcrumb,
  status,
  summary,
  actions,
  headingAs: Heading = "h1",
  titleRef,
  titleId,
  LinkComponent: Link = "a" as unknown as ShellLink,
  className,
}: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn("flex flex-col gap-3 border-b bg-background px-4 pb-4 pt-5 md:px-8", className)}
    >
      {breadcrumb && breadcrumb.length > 0 ? <Crumbs items={breadcrumb} Link={Link} /> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Heading
          ref={titleRef}
          id={titleId}
          tabIndex={-1}
          className="text-page-title text-foreground focus-visible:outline-none"
        >
          {title}
        </Heading>
        {status}
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 md:ml-auto">{actions}</div>
        ) : null}
      </div>
      {summary ? <p className="-mt-1.5 text-meta text-muted-foreground">{summary}</p> : null}
    </div>
  );
}
