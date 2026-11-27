"use client";

import type { Role, SpecDeliverable } from "@koklo/contract";
import { ShellNavGroup, ShellNavItem, type SpecKey, SpecNav } from "@koklo/ui";
import {
  canManage,
  canReadRepos,
  canWriteArchitecture,
  canWriteSecurity,
  canWriteSpec,
  canWriteTechnical,
} from "../lib/roles.ts";
import { defaultSection } from "../lib/settings-sections.ts";
import {
  activeSpecSlug,
  ideaPath,
  PROJECTS_PATH,
  projectPath,
  settingsPath,
  specPath,
  ticketsPath,
} from "../lib/shell-routes.ts";
import { specBadges } from "../lib/spec-badges.ts";
import { useProjectShell } from "../lib/use-project-shell.ts";
import { useProposalStatus } from "../lib/use-proposal-status.ts";
import { useSpecDeliverables } from "../lib/use-spec-deliverables.ts";
import { ShellLink } from "./shell-link.tsx";
import { SidebarProjectCard } from "./sidebar-project-card.tsx";

/** Livrables dont un lancement de l'agent tourne sans rien à relire encore : leur pastille dit « … » (maquettes 10 l.686, 11 l.625). */
function useGeneratingDeliverables(
  projectId: string,
  role: Role | undefined,
  deliverables: readonly SpecDeliverable[] | undefined,
): ReadonlySet<SpecKey> {
  // Même lecture que les pages Fonctionnel et Données (clé partagée).
  const open = (key: SpecKey) =>
    canWriteSpec(role) && deliverables?.find((item) => item.key === key)?.available === true;
  const functional = useProposalStatus(projectId, open("functional"));
  const data = useProposalStatus(projectId, open("data"), "data");
  // Le designer lit l'architecture sans lancer l'agent : sa lecture des propositions serait refusée (B510).
  const architecture = useProposalStatus(
    projectId,
    canWriteArchitecture(role) && open("architecture"),
    "architecture",
  );
  // Même règle pour le cahier technique (TK-115).
  const technical = useProposalStatus(
    projectId,
    canWriteTechnical(role) && open("technical"),
    "technical",
  );
  const security = useProposalStatus(
    projectId,
    canWriteSecurity(role) && open("security"),
    "security",
  );
  const generating = new Set<SpecKey>();
  if (functional.active && functional.counts.total === 0) generating.add("functional");
  if (data.active && data.counts.total === 0) generating.add("data");
  if (architecture.active && architecture.counts.total === 0) generating.add("architecture");
  if (technical.active && technical.counts.total === 0) generating.add("technical");
  if (security.active && security.counts.total === 0) generating.add("security");
  return generating;
}

/** Groupe « Projet » : carte du projet, Vue d'ensemble, Idée, SPEC, Tickets. */
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
  const spec = useSpecDeliverables(projectId);
  const generating = useGeneratingDeliverables(projectId, role, spec.data?.deliverables);
  const base = projectPath(projectId);
  // `spec.deliverables` en échec : aucune entrée SPEC n'est ouverte (fermé par défaut), la navigation reste.
  const hrefs = Object.fromEntries(
    (spec.data?.deliverables ?? [])
      .filter((deliverable) => deliverable.available)
      .map((deliverable) => [deliverable.key, specPath(projectId, deliverable.key)]),
  ) as Partial<Record<SpecKey, string>>;
  const is = (path: string) => pathname === path;
  const slug = activeSpecSlug(pathname);
  const ticketCount = shell.data?.ticketCount;

  return (
    <ShellNavGroup label="Projet">
      <SidebarProjectCard projectId={projectId} shell={shell} canCreate={canManage(role)} />
      <div className="mt-1 flex flex-col gap-0.5">
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
        <SpecNav
          hrefs={hrefs}
          {...(slug ? { activeKey: slug } : {})}
          badges={specBadges(
            spec.data?.deliverables,
            generating,
            role !== undefined && !canReadRepos(role),
          )}
          validatedCount={spec.data?.validatedCount ?? 0}
          loading={spec.isPending}
          LinkComponent={ShellLink}
        />
        <ShellNavItem
          href={ticketsPath(projectId)}
          icon="view_kanban"
          label="Tickets"
          active={is(ticketsPath(projectId))}
          {...(typeof ticketCount === "number" ? { count: ticketCount } : {})}
          LinkComponent={ShellLink}
        />
      </div>
    </ShellNavGroup>
  );
}

/** Groupe « Organisation » : Tous les projets et, selon le rôle, Réglages (visible de tous : la section d'arrivée dépend du rôle). */
export function OrganizationNav({ pathname, role }: { pathname: string; role: Role | undefined }) {
  return (
    <ShellNavGroup label="Organisation" separator>
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
    </ShellNavGroup>
  );
}
