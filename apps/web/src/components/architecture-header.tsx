import {
  DeliverableStatus,
  formatCount,
  type IconName,
  ProjectHeader,
  type ProjectHeaderTab,
} from "@koklo/ui";
import type { ReactNode, Ref } from "react";
import {
  ARCHITECTURE_TAB_ICONS,
  ARCHITECTURE_TAB_LABELS,
  type ArchitectureTab,
  visibleArchitectureTabs,
} from "../lib/architecture-tab.ts";
import type { HeaderTabCount } from "../lib/features-header-state.ts";
import { projectPath, specPath } from "../lib/shell-routes.ts";
import { ageOf } from "../lib/spec-age.ts";
import { ShellLink } from "./shell-link.tsx";

type TabCounts = Partial<Record<ArchitectureTab, HeaderTabCount>>;

function tabsOf(
  projectId: string,
  active: ArchitectureTab,
  counts: TabCounts,
  reviewing: boolean,
  client: boolean,
) {
  // Le client ne lit pas le Document : ses sections n'ont pas de « En clair » (B581).
  return visibleArchitectureTabs(reviewing)
    .filter((tab) => !(client && tab === "document"))
    .map<ProjectHeaderTab>((tab) => {
      const count = counts[tab];
      // La relecture suit l'onglet : chaque onglet garde `view=review` (l'architecture proposée s'y lit).
      const query = `?tab=${tab}${reviewing ? "&view=review" : ""}`;
      return {
        label: ARCHITECTURE_TAB_LABELS[tab],
        icon: ARCHITECTURE_TAB_ICONS[tab] satisfies IconName,
        href: `${specPath(projectId, "architecture")}${query}`,
        active: tab === active,
        ...(count
          ? {
              count: typeof count.value === "number" ? formatCount(count.value) : count.value,
              ...(count.tone ? { countTone: count.tone } : {}),
            }
          : {}),
      };
    });
}

/**
 * En-tête de l'écran Architecture (« <projet> / Spec / Architecture », h1 « Architecture », maquette 13 l.58-88) :
 * emplacement, SHA et âge de la spec pour l'équipe, statut, résumé en ligne entière, actions et onglets en liens.
 */
export function ArchitectureHeader({
  projectId,
  name,
  titleRef,
  status,
  statusLabel,
  statusIcon,
  summary,
  secondaryActions,
  tabCounts,
  reviewing,
  tab,
  head,
  team,
  client = false,
}: {
  projectId: string;
  name: string | undefined;
  titleRef: Ref<HTMLHeadingElement>;
  status?: Parameters<typeof DeliverableStatus>[0]["status"] | undefined;
  statusLabel?: string | undefined;
  statusIcon?: IconName | undefined;
  summary?: string | undefined;
  secondaryActions?: ReactNode;
  tabCounts?: TabCounts | undefined;
  reviewing: boolean;
  tab: ArchitectureTab;
  head: { commitSha: string; indexedAt: string } | undefined;
  team: boolean;
  /** Vue client : sans l'onglet Document. */
  client?: boolean;
}) {
  return (
    <ProjectHeader
      project={{ name: name ?? "Projet", href: projectPath(projectId) }}
      section="Spec"
      page="Architecture"
      title="Architecture"
      titleRef={titleRef}
      {...(status
        ? {
            status: (
              <DeliverableStatus
                status={status}
                {...(statusLabel ? { label: statusLabel } : {})}
                {...(statusIcon ? { icon: statusIcon } : {})}
              />
            ),
          }
        : {})}
      {...(summary ? { summary, summaryOwnLine: true } : {})}
      {...(team && head
        ? { sha: { value: head.commitSha.slice(0, 7), age: ageOf(head.indexedAt) } }
        : {})}
      {...(secondaryActions ? { secondaryActions } : {})}
      tabs={tabsOf(projectId, tab, tabCounts ?? {}, reviewing, client)}
      tabsLabel="Sections de l'architecture"
      LinkComponent={ShellLink}
    />
  );
}
