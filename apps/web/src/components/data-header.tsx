import {
  DeliverableStatus,
  formatCount,
  type IconName,
  ProjectHeader,
  type ProjectHeaderTab,
} from "@koklo/ui";
import type { ReactNode, Ref } from "react";
import { DATA_TAB_ICONS, DATA_TAB_LABELS, type DataTab, visibleDataTabs } from "../lib/data-tab.ts";
import type { HeaderTabCount } from "../lib/features-header-state.ts";
import { projectPath, specPath } from "../lib/shell-routes.ts";
import { ageOf } from "../lib/spec-age.ts";
import { ShellLink } from "./shell-link.tsx";

type TabCounts = Partial<Record<DataTab, HeaderTabCount>>;

function tabsOf(projectId: string, active: DataTab, counts: TabCounts, reviewing: boolean) {
  return visibleDataTabs(reviewing).map<ProjectHeaderTab>((tab) => {
    const count = counts[tab];
    // La relecture suit l'onglet : chaque onglet garde `view=review` (le modèle proposé s'y lit).
    const query = `?tab=${tab}${reviewing ? "&view=review" : ""}`;
    return {
      label: DATA_TAB_LABELS[tab],
      icon: DATA_TAB_ICONS[tab] satisfies IconName,
      href: `${specPath(projectId, "data")}${query}`,
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
 * En-tête de l'écran Données (« <projet> / Spec / Données », h1 « Modèle de données », maquette 11 l.74-89) :
 * emplacement, SHA et âge de la spec pour l'équipe, statut, résumé, actions et onglets en liens.
 */
export function DataHeader({
  projectId,
  name,
  titleRef,
  status,
  statusLabel,
  statusIcon,
  summary,
  secondaryActions,
  primaryAction,
  tabCounts,
  reviewing,
  tab,
  head,
  team,
}: {
  projectId: string;
  name: string | undefined;
  titleRef: Ref<HTMLHeadingElement>;
  status?: Parameters<typeof DeliverableStatus>[0]["status"] | undefined;
  statusLabel?: string | undefined;
  statusIcon?: IconName | undefined;
  summary?: string | undefined;
  secondaryActions?: ReactNode;
  primaryAction?: ReactNode;
  tabCounts?: TabCounts | undefined;
  reviewing: boolean;
  tab: DataTab;
  head: { commitSha: string; indexedAt: string } | undefined;
  team: boolean;
}) {
  return (
    <ProjectHeader
      project={{ name: name ?? "Projet", href: projectPath(projectId) }}
      section="Spec"
      page="Données"
      title="Modèle de données"
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
      {...(primaryAction ? { primaryAction } : {})}
      tabs={tabsOf(projectId, tab, tabCounts ?? {}, reviewing)}
      tabsLabel="Sections du modèle de données"
      LinkComponent={ShellLink}
    />
  );
}
