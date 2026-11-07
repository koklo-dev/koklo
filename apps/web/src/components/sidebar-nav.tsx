"use client";

import type { Role } from "@koklo/contract";
import { ShellNavItem, type SpecKey, SpecNav, useShell } from "@koklo/ui";
import { canManage, canWriteSpec } from "../lib/roles.ts";
import { defaultSection } from "../lib/settings-sections.ts";
import {
  activeSpecSlug,
  framingPath,
  ideaPath,
  PROJECTS_PATH,
  projectPath,
  settingsPath,
  specPath,
  ticketsPath,
} from "../lib/shell-routes.ts";
import { useProjectShell } from "../lib/use-project-shell.ts";
import { ShellLink } from "./shell-link.tsx";
import { SidebarProjectCard } from "./sidebar-project-card.tsx";

const GROUP_LABEL = "px-2.5 pb-1 text-group-label uppercase text-muted-foreground";

function GroupLabel({ children }: { children: string }) {
  const { collapsed } = useShell();
  return collapsed ? (
    <span aria-hidden="true" className="mx-auto my-2 h-px w-6 bg-border-strong" />
  ) : (
    <p className={GROUP_LABEL}>{children}</p>
  );
}

function TicketCount({ count }: { count: number | null | undefined }) {
  if (count === null || count === undefined) return null;
  return (
    <span className="rounded-full bg-secondary px-1.5 text-caption text-secondary-foreground">
      {count}
    </span>
  );
}

/** Groupe « Projet » : carte du projet, Vue d'ensemble, Idée, Assistant de cadrage, SPEC, Tickets. */
export function ProjectNav({
  projectId,
  pathname,
  role,
}: {
  projectId: string;
  pathname: string;
  role: Role | undefined;
}) {
  const shell = useProjectShell(projectId);
  const base = projectPath(projectId);
  // `project.shell` en échec : aucune entrée SPEC n'est ouverte (fermé par défaut), la navigation reste.
  const hrefs = Object.fromEntries(
    (shell.data?.deliverables ?? [])
      .filter((deliverable) => deliverable.available)
      .map((deliverable) => [deliverable.key, specPath(projectId, deliverable.key)]),
  ) as Partial<Record<SpecKey, string>>;
  const is = (path: string) => pathname === path;
  const slug = activeSpecSlug(pathname);

  return (
    <div className="flex flex-col gap-1">
      <GroupLabel>Projet</GroupLabel>
      <SidebarProjectCard projectId={projectId} shell={shell} canCreate={canManage(role)} />
      <div className="mt-1 flex flex-col gap-px">
        <ShellNavItem
          href={base}
          icon="space_dashboard"
          label="Vue d'ensemble"
          active={is(base)}
          LinkComponent={ShellLink}
        />
        <ShellNavItem
          href={ideaPath(projectId)}
          icon="lightbulb"
          label="Idée"
          active={is(ideaPath(projectId))}
          LinkComponent={ShellLink}
        />
        {canWriteSpec(role) ? (
          <ShellNavItem
            href={framingPath(projectId)}
            icon="smart_toy"
            label="Assistant de cadrage"
            active={is(framingPath(projectId))}
            LinkComponent={ShellLink}
          />
        ) : null}
        <SpecNav
          hrefs={hrefs}
          {...(slug ? { activeKey: slug } : {})}
          validatedCount={shell.data?.validatedCount ?? 0}
          loading={shell.isPending}
          LinkComponent={ShellLink}
        />
        <ShellNavItem
          href={ticketsPath(projectId)}
          icon="view_kanban"
          label="Tickets"
          active={is(ticketsPath(projectId))}
          badge={<TicketCount count={shell.data?.ticketCount} />}
          LinkComponent={ShellLink}
        />
      </div>
    </div>
  );
}

/** Groupe « Organisation » : Tous les projets et, selon le rôle, Réglages (visible de tous : la section d'arrivée dépend du rôle). */
export function OrganizationNav({ pathname, role }: { pathname: string; role: Role | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <GroupLabel>Organisation</GroupLabel>
      <div className="flex flex-col gap-px">
        <ShellNavItem
          href={PROJECTS_PATH}
          icon="folder_open"
          label="Tous les projets"
          active={pathname === PROJECTS_PATH}
          LinkComponent={ShellLink}
        />
        <ShellNavItem
          href={settingsPath(defaultSection(role))}
          icon="settings"
          label="Réglages"
          active={pathname.startsWith("/settings")}
          LinkComponent={ShellLink}
        />
      </div>
    </div>
  );
}
