"use client";

import {
  AgentProposeButton,
  type AgentProposeOption,
  AgentProposePopover,
  type AgentProposeState,
  ProposalGenerationBanner,
  ProposalSkeleton,
} from "@koklo/ui";
import { useState } from "react";
import { DevUiFrame, DevUiSection } from "./dev-ui-frame.tsx";
import { DemoReview } from "./dev-ui-proposals-review.tsx";

const OPTIONS: AgentProposeOption[] = [
  {
    id: "complete",
    title: "Compléter le cahier",
    description: "Fonctionnalités et critères qui manquent encore.",
    countLabel: "3 critères",
  },
  {
    id: "criteria",
    title: "Écrire les critères manquants",
    description: "Un scénario pour chaque fonctionnalité sans critère.",
  },
  {
    id: "update",
    title: "Mettre à jour depuis le dossier",
    description: "Reprendre les changements du dossier d'idée.",
    count: 0,
  },
  { id: "all", title: "Tout reproposer", description: "Repartir du dossier d'idée figé." },
];

const STATES: { state: AgentProposeState; name: string }[] = [
  { state: "idle", name: "Repos" },
  { state: "open", name: "Panneau ouvert" },
  { state: "running", name: "En cours" },
  { state: "ready", name: "Propositions prêtes" },
  { state: "unavailable", name: "Indisponible" },
];

function ButtonStates() {
  return (
    <DevUiFrame title="AgentProposeButton, cinq états" wide>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 p-0">
        {STATES.map(({ state, name }) => (
          <li key={state} className="flex flex-col gap-3 rounded-xl border bg-surface p-4">
            <span className="text-caption text-muted-foreground">{name}</span>
            <span className="flex min-h-11 items-center">
              <AgentProposeButton
                state={state}
                readyCount={3}
                reason="Aucune clé d'IA n'est configurée pour l'organisation."
                settingsHref="/settings/ai"
                onClick={() => undefined}
              />
            </span>
          </li>
        ))}
      </ul>
    </DevUiFrame>
  );
}

function Modal() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("complete");
  const [instruction, setInstruction] = useState("");
  return (
    <DevUiFrame title="AgentProposePopover">
      <AgentProposeButton state={open ? "open" : "idle"} onClick={() => setOpen(true)} />
      <AgentProposePopover
        open={open}
        onOpenChange={setOpen}
        subtitle="Fonctionnel"
        options={OPTIONS}
        value={value}
        onValueChange={setValue}
        instruction={instruction}
        onInstructionChange={setInstruction}
        instructionPlaceholder="ex. « ajoute des cas limites sur les horaires d'été »"
        reads={["Dossier d'idée figé (idea-v1)", "Synthèse", "Cahier fonctionnel actuel"]}
        onLaunch={() => setOpen(false)}
      />
    </DevUiFrame>
  );
}

function Generating() {
  return (
    <DevUiFrame title="Génération en cours">
      <ProposalGenerationBanner onLeave={() => undefined}>
        L'agent rédige le cahier fonctionnel à partir du dossier d'idée. Cela peut prendre une
        minute. Vous pouvez quitter la page.
      </ProposalGenerationBanner>
      <ProposalSkeleton />
    </DevUiFrame>
  );
}

/** Section « 16. Propositions de l'agent » de la galerie (TK-99b, DESIGN.md §5.13). */
export function DevUiProposals() {
  return (
    <DevUiSection id="dev-ui-proposals" title="16. Propositions de l'agent">
      <ButtonStates />
      <Modal />
      <Generating />
      <DevUiFrame title="Relecture à plat (12 propositions)" wide>
        <DemoReview count={12} />
      </DevUiFrame>
      <DevUiFrame title="Relecture en volume (400 propositions, groupes)" wide>
        <DemoReview count={400} />
      </DevUiFrame>
    </DevUiSection>
  );
}
