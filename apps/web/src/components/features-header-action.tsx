"use client";

import { Button, Icon } from "@koklo/ui";
import {
  type HeaderAction,
  type HeaderInput,
  headerStateOf,
} from "../lib/features-header-state.ts";
import { CREATE_LABELS, type FeaturesTab } from "../lib/features-tab.ts";
import type { useProposals } from "../lib/use-proposals.ts";
import { useSpecDeliverables } from "../lib/use-spec-deliverables.ts";
import { ProposeButton } from "./features-propose.tsx";

type Propose = ReturnType<typeof useProposals>;

/** Bouton de l'agent : le même dans l'en-tête et dans l'état vide, toujours sur le modèle partagé de la page. */
export function ProposeEntry({
  propose,
  onReview,
  idleLabel,
}: {
  propose: Propose;
  onReview: () => void;
  idleLabel?: string;
}) {
  return (
    <ProposeButton
      {...(idleLabel ? { idleLabel } : {})}
      launch={propose.launch}
      readyCount={propose.status.counts.pending}
      onReview={onReview}
    />
  );
}

interface ActionProps {
  action: HeaderAction;
  tab: FeaturesTab;
  propose: Propose;
  onCreate: () => void;
  onReview: () => void;
}

const BUTTON = "h-11 w-full md:h-9 md:w-auto";

/** Bouton d'une action de l'en-tête (maquette 10 l.637-658) ; `create` est la seule action primaire. */
export function HeaderActionButton({ action, tab, propose, onCreate, onReview }: ActionProps) {
  switch (action) {
    case "propose":
      return <ProposeEntry propose={propose} onReview={onReview} />;
    case "add":
      return (
        <Button
          type="button"
          variant="outline"
          data-new-feature
          className={BUTTON}
          onClick={onCreate}
        >
          <Icon name="add" size={20} />
          Ajouter
        </Button>
      );
    case "repropose":
      return (
        <Button type="button" className={BUTTON} onClick={() => propose.launch.setOpen(true)}>
          <Icon name="wand_stars" size={20} />
          Reproposer
        </Button>
      );
    case "create":
      return (
        <Button type="button" data-new-feature className={BUTTON} onClick={onCreate}>
          <Icon name="add" size={20} />
          {CREATE_LABELS[tab]}
        </Button>
      );
  }
}

type HeaderSource = Omit<
  HeaderInput,
  "deliverable" | "generating" | "pending" | "agent" | "reviewing"
>;

/** État de l'en-tête (statut, résumé, actions, compteurs d'onglet) déduit de l'état de la page. */
export function useHeaderState(propose: Propose, projectId: string, source: HeaderSource) {
  const deliverables = useSpecDeliverables(projectId);
  const functional = deliverables.data?.deliverables.find((item) => item.key === "functional");
  const { status } = propose;
  return headerStateOf({
    ...source,
    agent: propose.enabled,
    reviewing: propose.reviewing,
    generating: status.active && status.counts.total === 0,
    pending: status.counts.pending,
    pendingByTab: propose.pendingByTab,
    deliverable: functional?.status,
  });
}
