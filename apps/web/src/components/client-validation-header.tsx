"use client";

import type { ClientSpaceProgress } from "@koklo/contract";
import { Button, Icon, InlineAlert } from "@koklo/ui";
import { progressSummary } from "../lib/client-validation-labels.ts";
import type { HeaderTabCount } from "../lib/features-header-state.ts";
import type { FeaturesTab } from "../lib/features-tab.ts";
import type { useReviewActions } from "../lib/use-review-actions.ts";
import { FeaturesHeader } from "./features-header.tsx";

type Actions = ReturnType<typeof useReviewActions>;

const TABS = ["features", "rules", "roles", "flows"] as const satisfies readonly FeaturesTab[];

function tabCounts(progress: ClientSpaceProgress | undefined) {
  if (!progress) return undefined;
  const counts: Partial<Record<FeaturesTab, HeaderTabCount>> = {};
  for (const tab of TABS) counts[tab] = { value: progress.tabs[tab].count };
  return counts;
}

/** « Valider le cahier » (pointillé tant que tout n'est pas traité, raison dite) ou « Envoyer mes demandes » (maquette 10 l.643). */
function FinishButton({ progress, actions }: { progress: ClientSpaceProgress; actions: Actions }) {
  const requested = progress.toRevise > 0;
  const done = progress.untreated === 0;
  return (
    <Button
      type="button"
      className="h-11 w-full md:h-9 md:w-auto"
      disabled={!done || actions.pending}
      {...(done ? {} : { disabledReason: "Traitez chaque onglet pour finir" })}
      onClick={() =>
        void actions.decide({
          targetKind: "deliverable",
          targetRef: "functional",
          version: progress.version,
          status: requested ? "changes_requested" : "approved",
        })
      }
    >
      <Icon name={requested ? "send" : "verified"} size={20} />
      {requested ? "Envoyer mes demandes" : "Valider le cahier"}
    </Button>
  );
}

/** Refus du serveur : « Il reste des éléments à traiter » (B353). */
export function FinishError({ text }: { text: string | undefined }) {
  if (!text) return null;
  return (
    <InlineAlert variant="error" icon="error">
      {text}
    </InlineAlert>
  );
}

interface HeaderProps {
  projectId: string;
  name: string | undefined;
  titleRef: React.Ref<HTMLHeadingElement>;
  tab: FeaturesTab;
  progress: ClientSpaceProgress | undefined;
  actions: Actions;
  /** Vue client ouverte par l'équipe (`?vue=client`) : les onglets la gardent. */
  clientView: boolean;
}

/** En-tête de la vue client (maquette 10 l.643, 675-677) : statut, progression, compteurs d'onglet, bouton de fin. */
export function ClientValidationHeader({
  projectId,
  name,
  titleRef,
  tab,
  progress,
  actions,
  clientView,
}: HeaderProps) {
  const validated = progress?.validation === "validated";
  const attended = progress?.canValidate === true;
  return (
    <FeaturesHeader
      projectId={projectId}
      name={name}
      titleRef={titleRef}
      tab={tab}
      head={undefined}
      team={false}
      clientView={clientView}
      {...(progress
        ? {
            status: validated ? ("validated" as const) : ("pending" as const),
            statusLabel: validated
              ? "Cahier validé"
              : attended
                ? "Validation attendue de votre part"
                : "À valider par le client",
            summary: progressSummary(progress),
            tabCounts: tabCounts(progress),
          }
        : {})}
      {...(progress && attended && !validated
        ? { primaryAction: <FinishButton progress={progress} actions={actions} /> }
        : {})}
    />
  );
}
