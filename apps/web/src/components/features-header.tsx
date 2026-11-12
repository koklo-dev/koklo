import {
  DeliverableStatus,
  type DeliverableStatusValue,
  formatCount,
  type IconName,
  ProjectHeader,
  type ProjectHeaderTab,
} from "@koklo/ui";
import type { ReactNode, Ref } from "react";
import type { HeaderTabCount } from "../lib/features-header-state.ts";
import { FEATURES_TABS, type FeaturesTab } from "../lib/features-tab.ts";
import { projectPath, specPath } from "../lib/shell-routes.ts";
import { ageOf } from "../lib/spec-age.ts";
import { ShellLink } from "./shell-link.tsx";

/** Icône de 16 px de chaque onglet (maquette 10 l.670, tabDef). */
const TAB_ICONS: Record<FeaturesTab, IconName> = {
  features: "task_alt",
  rules: "gavel",
  roles: "admin_panel_settings",
  flows: "route",
};

const TAB_LABELS: Record<FeaturesTab, string> = {
  features: "Fonctionnalités",
  rules: "Règles métier",
  roles: "Rôles et permissions",
  flows: "Parcours",
};

/** Ce que l'en-tête lit de `spec.head` : l'identifiant du commit, la date d'indexation et le nombre de fonctionnalités. */
export interface FeaturesHead {
  commitSha: string;
  indexedAt: string;
  counts: { features: number };
}

function tabsOf(projectId: string, active: FeaturesTab, count: HeaderTabCount | undefined) {
  return FEATURES_TABS.map<ProjectHeaderTab>((tab) => ({
    label: TAB_LABELS[tab],
    icon: TAB_ICONS[tab],
    href: `${specPath(projectId, "functional")}?tab=${tab}`,
    active: tab === active,
    // Seul le compteur des fonctionnalités est connu (index) ; les autres onglets n'en ont pas.
    ...(tab === "features" && count
      ? {
          count: typeof count.value === "number" ? formatCount(count.value) : count.value,
          ...(count.tone ? { countTone: count.tone } : {}),
        }
      : {}),
  }));
}

/**
 * En-tête du cahier fonctionnel (Spec · Fonctionnel, maquette 10 l.59-89) : emplacement, SHA et âge de la spec pour
 * l'équipe, statut et résumé de l'état, actions de l'équipe qui écrit, onglets en liens. Sans lecture de la spec :
 * ni SHA, ni statut, ni résumé, sans trou.
 */
export function FeaturesHeader({
  projectId,
  name,
  titleRef,
  status,
  statusLabel,
  summary,
  secondaryActions,
  primaryAction,
  tabCount,
  tab,
  head,
  team,
}: {
  projectId: string;
  name: string | undefined;
  titleRef: Ref<HTMLHeadingElement>;
  /** Statut du livrable (Prêt, Génération, En cours, À valider, …) : équipe seulement. */
  status?: DeliverableStatusValue | undefined;
  statusLabel?: string | undefined;
  summary?: string | undefined;
  /** Actions de l'équipe qui écrit, avant l'action primaire dans l'ordre visuel. */
  secondaryActions?: ReactNode;
  /** « Nouvelle fonctionnalité » : la seule action primaire. */
  primaryAction?: ReactNode;
  tabCount?: HeaderTabCount | undefined;
  tab: FeaturesTab;
  head: FeaturesHead | undefined;
  team: boolean;
}) {
  return (
    <ProjectHeader
      project={{ name: name ?? "Projet", href: projectPath(projectId) }}
      section="Spec"
      page="Fonctionnel"
      title="Cahier fonctionnel"
      titleRef={titleRef}
      {...(status
        ? {
            status: (
              <DeliverableStatus status={status} {...(statusLabel ? { label: statusLabel } : {})} />
            ),
          }
        : {})}
      {...(summary ? { summary, summaryOwnLine: true } : {})}
      {...(team && head
        ? { sha: { value: head.commitSha.slice(0, 7), age: ageOf(head.indexedAt) } }
        : {})}
      {...(secondaryActions ? { secondaryActions } : {})}
      {...(primaryAction ? { primaryAction } : {})}
      tabs={tabsOf(projectId, tab, tabCount)}
      tabsLabel="Sections du cahier fonctionnel"
      LinkComponent={ShellLink}
    />
  );
}
