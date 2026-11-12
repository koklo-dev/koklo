import type { ReactNode, Ref } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import type { ShellLink } from "./app-shell.tsx";
import { TabsNav, type TabsNavItem } from "./tabs.tsx";

/** Onglet d'un en-tête : même forme que `TabsNavItem`. */
export type ProjectHeaderTab = TabsNavItem;

export interface ProjectHeaderProps {
  project: { name: string; href: string };
  /** Section de l'emplacement (« Spec ») ; omise pour les pages sans section. */
  section?: string;
  page: string;
  title: string;
  summary?: string;
  /** Le résumé a sa propre ligne sous le titre, à toute largeur (maquette 10 l.77) ; sinon il rejoint la rangée du titre dès md. */
  summaryOwnLine?: boolean;
  /** État du livrable à côté du titre (`ValidationStatus`, `DeliverableStatus`). */
  status?: ReactNode;
  /** Équipe seulement : SHA de 7 caractères et âge (« il y a 3 min »). */
  sha?: { value: string; age?: string };
  /** Information à droite de l'emplacement (ex. état d'enregistrement) ; remplace `sha` quand les deux sont donnés. */
  meta?: ReactNode;
  /** Action principale : avant la secondaire dans l'ordre de focus, en dernier visuellement. */
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  tabs?: ProjectHeaderTab[];
  tabsLabel?: string;
  LinkComponent?: ShellLink;
  /** Niveau du titre : h1 sur une page ; plus bas seulement pour une démonstration dans la galerie. */
  headingAs?: "h1" | "h4";
  /** Référence et identifiant du titre : cible du focus programmatique après une action de la page. */
  titleRef?: Ref<HTMLHeadingElement>;
  titleId?: string;
  className?: string;
}

function Location({
  project,
  section,
  page,
  Link,
}: Pick<ProjectHeaderProps, "project" | "section" | "page"> & { Link: ShellLink }) {
  const separator = (
    <span aria-hidden="true" className="mx-3">
      /
    </span>
  );
  return (
    <nav aria-label="Emplacement" className="min-w-0">
      <ol className="flex min-w-0 items-center text-meta text-muted-foreground">
        <li className="min-w-0 truncate">
          <Link href={project.href} className="font-medium text-foreground hover:underline">
            {project.name}
          </Link>
          {separator}
        </li>
        {section ? (
          <li className="shrink-0">
            {section}
            {separator}
          </li>
        ) : null}
        <li aria-current="page" className="shrink-0">
          {page}
        </li>
      </ol>
    </nav>
  );
}

function ShaInfo({ sha }: { sha: NonNullable<ProjectHeaderProps["sha"]> }) {
  return (
    <p className="flex shrink-0 items-center gap-1.5 text-meta text-muted-foreground">
      <Icon name="commit" size={16} />
      <span className="font-mono">{sha.value}</span>
      {sha.age ? <span>{`· spec à jour ${sha.age}`}</span> : null}
    </p>
  );
}

/** Onglets en liens d'un en-tête (aussi ceux de Réglages) : `Tabs underline` en mode lien, la ligne repose sur la bordure basse de l'en-tête. */
export function HeaderTabs(props: {
  tabs: ProjectHeaderTab[];
  label: string;
  LinkComponent?: ShellLink;
}) {
  return <TabsNav className="-mb-4 mt-3" {...props} />;
}

/**
 * En-tête de page de projet (DESIGN.md §5.4) : emplacement et SHA, titre avec résumé et actions, onglets
 * en liens. Une ligne sans donnée est absente, sans trou.
 */
export function ProjectHeader({
  project,
  section,
  page,
  title,
  summary,
  summaryOwnLine = false,
  status,
  sha,
  meta,
  primaryAction,
  secondaryActions,
  tabs,
  tabsLabel = "Onglets de la page",
  LinkComponent: Link = "a" as unknown as ShellLink,
  headingAs: Heading = "h1",
  titleRef,
  titleId,
  className,
}: ProjectHeaderProps) {
  const hasActions = Boolean(primaryAction || secondaryActions);
  return (
    <div
      data-slot="project-header"
      className={cn("border-b bg-background px-4 pb-4 pt-5 md:px-8", className)}
    >
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-4">
        <Location project={project} section={section} page={page} Link={Link} />
        {meta ?? (sha ? <ShaInfo sha={sha} /> : null)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Heading
          ref={titleRef}
          id={titleId}
          tabIndex={-1}
          className="text-page-title text-foreground focus-visible:outline-none"
        >
          {title}
        </Heading>
        {status}
        {summary ? (
          <p
            className={cn(
              "order-3 -mt-1.5 text-meta text-muted-foreground",
              summaryOwnLine
                ? "basis-full"
                : "max-md:basis-full md:order-none md:mt-0 md:basis-auto",
            )}
          >
            {summary}
          </p>
        ) : null}
        {hasActions ? (
          <div className="order-4 flex flex-col gap-2 max-md:basis-full md:order-none md:ml-auto md:flex-row md:items-center [&>*]:max-md:w-full">
            <div className="order-2 flex flex-col">{primaryAction}</div>
            <div className="order-1 flex flex-col gap-2 md:flex-row">{secondaryActions}</div>
          </div>
        ) : null}
      </div>
      {tabs && tabs.length > 0 ? (
        <HeaderTabs tabs={tabs} label={tabsLabel} LinkComponent={Link} />
      ) : null}
    </div>
  );
}
