import {
  DeliverableStatus,
  formatCount,
  type IconName,
  ProjectHeader,
  type ProjectHeaderTab,
} from "@koklo/ui";
import type { ReactNode, Ref } from "react";
import type { HeaderTabCount } from "../lib/features-header-state.ts";
import { projectPath, specPath } from "../lib/shell-routes.ts";
import { ageOf } from "../lib/spec-age.ts";
import { TECHNICAL_TITLE } from "../lib/technical-labels.ts";
import {
  TECHNICAL_TAB_ICONS,
  TECHNICAL_TAB_LABELS,
  type TechnicalTab,
  visibleTechnicalTabs,
} from "../lib/technical-tab.ts";
import { ShellLink } from "./shell-link.tsx";

type TabCounts = Partial<Record<TechnicalTab, HeaderTabCount>>;

function tabsOf(projectId: string, active: TechnicalTab, counts: TabCounts, reviewing: boolean) {
  return visibleTechnicalTabs(reviewing).map<ProjectHeaderTab>((tab) => {
    const count = counts[tab];
    // La relecture suit l'onglet : chaque onglet garde `view=review`.
    const query = `?tab=${tab}${reviewing ? "&view=review" : ""}`;
    return {
      label: TECHNICAL_TAB_LABELS[tab],
      icon: TECHNICAL_TAB_ICONS[tab] satisfies IconName,
      href: `${specPath(projectId, "technical")}${query}`,
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
 * En-tête de la page Technique (« <projet> / Spec / Technique », h1 « Cahier technique », maquette 14 l.59-88) :
 * emplacement, SHA et âge pour l'équipe, statut, résumé en ligne entière, actions et onglets en liens.
 */
export function TechnicalHeader({
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
  tab: TechnicalTab;
  /** Absent pour le client : ni SHA ni âge. */
  head?: { commitSha: string; indexedAt: string } | undefined;
}) {
  return (
    <ProjectHeader
      project={{ name: name ?? "Projet", href: projectPath(projectId) }}
      section="Spec"
      page="Technique"
      title={TECHNICAL_TITLE}
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
      {...(head ? { sha: { value: head.commitSha.slice(0, 7), age: ageOf(head.indexedAt) } } : {})}
      {...(secondaryActions ? { secondaryActions } : {})}
      tabs={tabsOf(projectId, tab, tabCounts ?? {}, reviewing)}
      tabsLabel="Sections du cahier technique"
      LinkComponent={ShellLink}
    />
  );
}
