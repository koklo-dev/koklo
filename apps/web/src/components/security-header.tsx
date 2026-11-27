import {
  DeliverableStatus,
  formatCount,
  type IconName,
  ProjectHeader,
  type ProjectHeaderTab,
} from "@koklo/ui";
import type { ReactNode, Ref } from "react";
import type { HeaderTabCount } from "../lib/features-header-state.ts";
import { SECURITY_TITLE, TABS_LABEL } from "../lib/security-labels.ts";
import {
  SECURITY_TAB_ICONS,
  SECURITY_TAB_LABELS,
  type SecurityTab,
  visibleSecurityTabs,
} from "../lib/security-tab.ts";
import { projectPath, specPath } from "../lib/shell-routes.ts";
import { ageOf } from "../lib/spec-age.ts";
import { ShellLink } from "./shell-link.tsx";

type TabCounts = Partial<Record<SecurityTab, HeaderTabCount>>;

/** Onglets de l'équipe, avec leurs comptes ; pendant une relecture, chaque onglet la garde ouverte. */
export function securityTabsOf(
  projectId: string,
  active: SecurityTab,
  counts: TabCounts,
  reviewing: boolean,
): ProjectHeaderTab[] {
  return visibleSecurityTabs(reviewing).map((tab) => {
    const count = counts[tab];
    const query = `?tab=${tab}${reviewing ? "&view=review" : ""}`;
    return {
      label: SECURITY_TAB_LABELS[tab],
      icon: SECURITY_TAB_ICONS[tab] satisfies IconName,
      href: `${specPath(projectId, "security")}${query}`,
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
 * En-tête de la page Sécurité (« <projet> / Spec / Sécurité », maquette 15 l.59-88) : emplacement, SHA et âge pour
 * l'équipe, statut, résumé sur sa ligne (relié à « Valider »), actions et onglets en liens.
 */
export function SecurityHeader({
  projectId,
  name,
  titleRef,
  status,
  statusLabel,
  statusIcon,
  summary,
  summaryId,
  actions,
  tabs,
  head,
}: {
  projectId: string;
  name: string | undefined;
  titleRef: Ref<HTMLHeadingElement>;
  status?: Parameters<typeof DeliverableStatus>[0]["status"] | undefined;
  statusLabel?: string | undefined;
  statusIcon?: IconName | undefined;
  summary?: string | undefined;
  summaryId?: string;
  actions?: ReactNode;
  tabs: ProjectHeaderTab[];
  /** Absent pour le client : ni SHA ni âge. */
  head?: { commitSha: string; indexedAt: string } | undefined;
}) {
  return (
    <ProjectHeader
      project={{ name: name ?? "Projet", href: projectPath(projectId) }}
      section="Spec"
      page={SECURITY_TITLE}
      title={SECURITY_TITLE}
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
      {...(summaryId ? { summaryId } : {})}
      {...(head ? { sha: { value: head.commitSha.slice(0, 7), age: ageOf(head.indexedAt) } } : {})}
      {...(actions ? { secondaryActions: actions } : {})}
      tabs={tabs}
      tabsLabel={TABS_LABEL}
      LinkComponent={ShellLink}
    />
  );
}
