"use client";

import type { Role } from "@koklo/contract";
import { Button, Icon } from "@koklo/ui";
import Link from "next/link";
import {
  type HeaderAction,
  type HeaderInput,
  headerStateOf,
} from "../lib/features-header-state.ts";
import { CREATE_LABELS, type FeaturesTab } from "../lib/features-tab.ts";
import { canManage } from "../lib/roles.ts";
import { useClientProgress } from "../lib/use-client-space.ts";
import type { useProposals } from "../lib/use-proposals.ts";
import { useRemindClient } from "../lib/use-remind-client.ts";
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
  /** Projet et prénom du client invité, pour « Relancer <prénom> » (TK-104). */
  client?: { projectId: string; firstName: string | null };
}

export type ClientEntry = NonNullable<ActionProps["client"]>;

const BUTTON = "h-11 w-full md:h-9 md:w-auto";

/** « Relancer <prénom> » (maquette 10 l.655) : un rappel au client, `role=status` pour « Rappel envoyé ». */
function RemindButton({ projectId, firstName }: { projectId: string; firstName: string | null }) {
  const { remind, pending, text } = useRemindClient(projectId);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={BUTTON}
        disabled={pending}
        onClick={remind}
      >
        <Icon name="notifications" size={20} />
        {firstName ? `Relancer ${firstName}` : "Relancer le client"}
      </Button>
      <span role="status" className="text-caption text-muted-foreground">
        {text}
      </span>
    </>
  );
}

/** Bouton d'une action de l'en-tête (maquette 10 l.637-658) ; `create` est la seule action primaire. */
export function HeaderActionButton({
  action,
  tab,
  propose,
  onCreate,
  onReview,
  client,
}: ActionProps) {
  switch (action) {
    case "remind":
      return client ? <RemindButton {...client} /> : null;
    case "validate-client":
      return (
        <Button asChild variant="outline" className={BUTTON}>
          <Link href="?tab=features&vue=client">
            <Icon name="verified" size={20} />
            Valider à la place du client
          </Link>
        </Button>
      );
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
  "deliverable" | "generating" | "pending" | "agent" | "reviewing" | "clientAction"
> & { role?: Role | undefined };

/** État de l'en-tête (statut, résumé, actions, compteurs d'onglet) déduit de l'état de la page. */
export function useHeaderState(propose: Propose, projectId: string, source: HeaderSource) {
  const { role, ...input } = source;
  const deliverables = useSpecDeliverables(projectId);
  const functional = deliverables.data?.deliverables.find((item) => item.key === "functional");
  const { status } = propose;
  // Le cahier attend le client : propriétaire et administrateur le relancent, ou le valident sans client (D1).
  const waiting = canManage(role) && functional?.status === "pending";
  const progress = useClientProgress(projectId, waiting);
  const state = headerStateOf({
    ...input,
    clientAction:
      waiting && progress.data
        ? progress.data.hasClient
          ? "remind"
          : "validate-client"
        : undefined,
    agent: propose.enabled,
    reviewing: propose.reviewing,
    generating: status.active && status.counts.total === 0,
    pending: status.counts.pending,
    pendingByTab: propose.pendingByTab,
    deliverable: functional?.status,
  });
  return { ...state, client: { projectId, firstName: progress.data?.clientFirstName ?? null } };
}
