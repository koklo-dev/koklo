import { Button, Icon, ProjectHeader, type ProjectHeaderTab } from "@koklo/ui";
import type { Ref } from "react";
import { FEATURES_TABS, type FeaturesTab } from "../lib/features-tab.ts";
import { projectPath, specPath } from "../lib/shell-routes.ts";
import { ageOf } from "../lib/spec-age.ts";
import { FramingLink } from "./framing-link.tsx";
import { ShellLink } from "./shell-link.tsx";

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

function tabsOf(projectId: string, active: FeaturesTab, count: number | undefined) {
  return FEATURES_TABS.map<ProjectHeaderTab>((tab) => ({
    label: TAB_LABELS[tab],
    href: `${specPath(projectId, "functional")}?tab=${tab}`,
    active: tab === active,
    // Seul le compteur des fonctionnalités est connu (index) ; les autres onglets n'en ont pas.
    ...(tab === "features" && count !== undefined ? { count } : {}),
  }));
}

/**
 * En-tête du cahier fonctionnel (Spec · Fonctionnel) : emplacement, SHA et âge de la spec et résumé pour l'équipe,
 * actions de l'équipe qui écrit, onglets en liens. Sans lecture de la spec : ni SHA ni résumé, sans trou.
 */
export function FeaturesHeader({
  projectId,
  name,
  titleRef,
  onCreate,
  tab,
  head,
  team,
}: {
  projectId: string;
  name: string | undefined;
  titleRef: Ref<HTMLHeadingElement>;
  /** Présent seulement pour l'équipe qui écrit, quand la spec est lue. */
  onCreate: (() => void) | undefined;
  tab: FeaturesTab;
  head: FeaturesHead | undefined;
  team: boolean;
}) {
  const count = head?.counts.features;
  return (
    <ProjectHeader
      project={{ name: name ?? "Projet", href: projectPath(projectId) }}
      section="Spec"
      page="Fonctionnel"
      title="Cahier fonctionnel"
      titleRef={titleRef}
      {...(team && count !== undefined
        ? { summary: `${count} ${count === 1 ? "fonctionnalité" : "fonctionnalités"}` }
        : {})}
      {...(team && head
        ? { sha: { value: head.commitSha.slice(0, 7), age: ageOf(head.indexedAt) } }
        : {})}
      {...(onCreate
        ? {
            secondaryActions: <FramingLink projectId={projectId} />,
            primaryAction: (
              <Button
                type="button"
                data-new-feature
                className="h-11 w-full md:h-9 md:w-auto"
                onClick={onCreate}
              >
                <Icon name="add" size={20} />
                Nouvelle fonctionnalité
              </Button>
            ),
          }
        : {})}
      tabs={tabsOf(projectId, tab, count)}
      tabsLabel="Onglets du cahier fonctionnel"
      LinkComponent={ShellLink}
    />
  );
}
