"use client";

import {
  ARCH_NODE_LABELS,
  ArchNodeCard,
  type ArchNodeKind,
  DecisionStatus,
  DiagramViewer,
  IdTag,
  InlineAlert,
  ListPanel,
  ListRow,
  SequenceDiagram,
  ZoneNode,
} from "@koklo/ui";
import { useMemo, useState } from "react";
import {
  type ArchNode,
  type ArchZoneDetail,
  bandsOf,
  isGhostId,
  nodesOf,
  positionsOf,
  relationsOf,
} from "../lib/architecture-diagram.ts";
import { DevUiFrame, DevUiNote, DevUiSection } from "./dev-ui-frame.tsx";

const KINDS: ArchNodeKind[] = ["actor", "app", "service", "store", "queue", "ext"];

const DETAIL: ArchZoneDetail = {
  zone: { id: "Z-rdv", name: "Prise de rendez-vous" },
  components: [
    { specId: "C-portail", name: "Portail client", type: "app" },
    { specId: "C-api", name: "API", type: "service" },
    { specId: "C-file", name: "File des rappels", type: "queue" },
    { specId: "C-base", name: "Base de données", type: "store" },
    { specId: "C-sms", name: "Fournisseur SMS", type: "ext" },
  ],
  relations: [
    { from: "C-portail", to: "C-api", via: "contrat typé" },
    { from: "C-api", to: "C-base", via: "SQL" },
    { from: "C-api", to: "C-file", via: "planifie", async: true },
    { from: "C-file", to: "C-sms", via: "envoie", async: true },
  ],
  actors: [{ id: "RL-client", name: "Client" }],
  outgoing: [{ zone: "Z-com", count: 1 }],
};

const GHOSTS = [{ id: "Z-com", name: "Communication" }];

const FLOW_PARTICIPANTS = [
  { id: "RL-client", name: "Client", type: "actor" },
  { id: "C-portail", name: "Portail", type: "app" },
  { id: "C-api", name: "API", type: "service" },
  { id: "C-sms", name: "SMS", type: "ext" },
] as const;

const FLOW_ITEMS = [
  { kind: "message", from: "RL-client", to: "C-portail", text: "Choisit un créneau" },
  {
    kind: "message",
    from: "C-portail",
    to: "C-api",
    text: "reservation.create",
    reply: "Confirmée",
  },
  {
    kind: "alt",
    label: "sinon · créneau pris entre-temps",
    messages: [
      {
        from: "C-api",
        to: "C-portail",
        text: "Conflit d'unicité",
        error: "409 · 3 créneaux proches",
      },
    ],
  },
  { kind: "separator", label: "La veille à 18 h" },
  { kind: "message", from: "C-api", to: "C-sms", text: "Envoie le SMS de rappel" },
] as const;

const renderNode = (
  node: ArchNode,
  context: { selected: boolean; ghost: boolean; compact: boolean; onSelect: () => void },
) => <ArchNodeCard kind={node.kind} name={node.name} subtitle={node.subtitle} {...context} />;

/** Démonstrations liées aux décisions : `DecisionStatus`, `ListRow wrap`, `InlineAlert` à actions. */
function DevUiDecisionFrames() {
  return (
    <>
      <DevUiFrame title="DecisionStatus : Acceptée, Proposée, Remplacée (libellé toujours écrit)">
        <div className="flex flex-wrap items-center gap-3">
          <DecisionStatus status="acceptee" />
          <DecisionStatus status="proposee" />
          <DecisionStatus status="remplacee" />
        </div>
      </DevUiFrame>
      <DevUiFrame title="ListRow wrap : titre et sous-titre à la ligne, marges 10/14 (lignes de décisions)">
        <ListPanel label="Décisions, démonstration" className="max-w-[420px]">
          <ListRow
            wrap
            leading={<IdTag>ADR-007</IdTag>}
            title="Rappels envoyés par une file de tâches plutôt que par un cron dans l'API"
            subtitle="12 oct. · C-api, C-db, F-001"
            trailing={<DecisionStatus status="acceptee" />}
          />
        </ListPanel>
      </DevUiFrame>
      <DevUiFrame title="InlineAlert actions : bouton primaire avec icône (bandeau À revoir)" wide>
        <InlineAlert
          variant="warning"
          icon="sync_problem"
          actions={[
            { label: "Voir les changements", onClick: () => undefined },
            {
              label: "Proposer les mises à jour",
              onClick: () => undefined,
              primary: true,
              icon: "wand_stars",
            },
          ]}
        >
          Le modèle de données a changé depuis la validation.
        </InlineAlert>
      </DevUiFrame>
    </>
  );
}

/** Section « 23. Schéma d'architecture » : `ArchNodeCard`, le lecteur en couches (bandes, zone voisine), `SequenceDiagram`. */
export function DevUiArchitecture() {
  const nodes = useMemo(() => nodesOf([DETAIL], GHOSTS), []);
  const relations = useMemo(() => relationsOf([DETAIL], nodes), [nodes]);
  const positions = useMemo(() => positionsOf(nodes, {}), [nodes]);
  const [selected, setSelected] = useState<string | null>("C-api");
  const ghostIds = useMemo(
    () => new Set(nodes.filter((node) => isGhostId(node.id)).map((node) => node.id)),
    [nodes],
  );
  return (
    <DevUiSection id="dev-ui-architecture" title="23. Schéma d'architecture">
      <DevUiDecisionFrames />
      <DevUiFrame title="ArchNodeCard : une forme par type, le type toujours écrit">
        <div className="flex flex-wrap items-start gap-3">
          {KINDS.map((kind) => (
            <ArchNodeCard key={kind} kind={kind} name={ARCH_NODE_LABELS[kind]} />
          ))}
          <ArchNodeCard kind="service" name="Sélectionné" selected />
          <ArchNodeCard kind="app" name="À relire" pending />
          <ArchNodeCard kind="service" name="À revoir" stale />
          <ArchNodeCard kind="service" name="Autre zone" subtitle="Hors zone" ghost />
          <ArchNodeCard kind="service" name="Compact" compact />
        </div>
      </DevUiFrame>
      <DevUiFrame title="ZoneNode variante architecture : zone du schéma">
        <ZoneNode
          name="Prise de rendez-vous"
          icon="folder_open"
          count={8}
          countLabel="composants"
          detail="2 acteurs · cliquez pour ouvrir"
          preview={["API", "Base", "Agenda"]}
          previewLimit={5}
          variant="architecture"
          arrow
          onOpen={() => undefined}
          className="w-[300px]"
        />
      </DevUiFrame>
      <DevUiFrame title="DiagramViewer : couches (bands) et zone voisine estompée (ghostIds)" wide>
        <DevUiNote>
          Quatre couches : Utilisateurs, Applications, Services, Données et services externes. Trait
          pointillé : appel asynchrone. La carte « Hors zone » ouvre l'autre zone.
        </DevUiNote>
        <DiagramViewer<ArchNode>
          label="Schéma d'architecture, démonstration"
          nodes={nodes}
          relations={relations}
          bands={bandsOf()}
          ghostIds={ghostIds}
          positions={positions}
          renderNode={renderNode}
          selectedId={selected}
          onSelect={(id) => !isGhostId(id) && setSelected(id)}
          minimap
          className="h-[520px]"
        />
      </DevUiFrame>
      <DevUiFrame
        title="SequenceDiagram : appels, retours, échec en rouge, bloc alt, séparateur"
        wide
      >
        <SequenceDiagram
          title="Réserver un rendez-vous"
          participants={FLOW_PARTICIPANTS}
          items={FLOW_ITEMS}
        />
      </DevUiFrame>
    </DevUiSection>
  );
}
