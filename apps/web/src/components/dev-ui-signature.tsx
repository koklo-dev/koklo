"use client";

import {
  Button,
  EmptyState,
  EntityChip,
  EntityPreviewBody,
  hoverCardSurface,
  Icon,
  InlineAlert,
  type Phase,
  PhaseRail,
} from "@koklo/ui";
import { AiSendPolicy, SEND_LINE, SendPolicyDetails } from "./ai-send-policy.tsx";
import { ENTITIES, ENTITY_PREVIEW, PHASE_SUBTITLES } from "./dev-ui-data.ts";
import { DevUiFrame, DevUiNote, DevUiRow, DevUiSection } from "./dev-ui-frame.tsx";

const PHASES: Phase[] = ["idea", "framing", "baseline", "iterations"];

/** Les actions d'exemple ne font rien (S-dev-ui §3) ; seul « Détails » déplie réellement. */
const noop = () => undefined;

const sendDetails = <SendPolicyDetails />;

function Entities() {
  return (
    <DevUiFrame title="EntityChip">
      <DevUiRow>
        {ENTITIES.map((entity) => (
          <EntityChip
            key={entity.id}
            {...entity}
            href={`#${entity.id}`}
            preview={entity.kind === "feature" ? ENTITY_PREVIEW : undefined}
          />
        ))}
      </DevUiRow>
      <DevUiNote>Aperçu ouvert (rendu statique)</DevUiNote>
      <div className={hoverCardSurface}>
        <EntityPreviewBody {...ENTITY_PREVIEW} />
      </div>
    </DevUiFrame>
  );
}

function Buttons() {
  return (
    <DevUiFrame title="Boutons">
      <DevUiRow>
        <Button>
          <Icon name="add" size={20} />
          Action principale
        </Button>
        <Button variant="outline">Secondaire</Button>
        <Button variant="ghost">Discret</Button>
      </DevUiRow>
      <Button disabled disabledReason="Toujours avec sa raison à côté">
        Désactivé
      </Button>
      <div>
        <Button disabled aria-busy="true">
          Enregistrement…
        </Button>
      </div>
    </DevUiFrame>
  );
}

function Alerts() {
  return (
    <DevUiFrame title="InlineAlert" wide>
      <InlineAlert variant="neutral" icon="lock" details={sendDetails}>
        {SEND_LINE}
      </InlineAlert>
      <InlineAlert variant="neutral" icon="lock" details={sendDetails} defaultOpen>
        {SEND_LINE}
      </InlineAlert>
      <InlineAlert variant="warning" icon="schedule" action={{ label: "Annuler", onClick: noop }}>
        Trop de demandes. Nouvel essai possible dans 28 s.
      </InlineAlert>
      <InlineAlert variant="error" icon="error" action={{ label: "Réessayer", onClick: noop }}>
        Le fournisseur n'a pas répondu à temps.
      </InlineAlert>
      <InlineAlert variant="neutral" icon="lock">
        {SEND_LINE}
      </InlineAlert>
    </DevUiFrame>
  );
}

function Phases() {
  return (
    <DevUiFrame title="PhaseRail" wide>
      <PhaseRail phase="framing" subtitles={PHASE_SUBTITLES} />
      <PhaseRail phase="idea" />
      <PhaseRail
        phase="framing"
        hrefs={{ idea: "#idee", framing: "#cadrage" }}
        subtitles={PHASE_SUBTITLES}
      />
      <PhaseRail phase="iterations" />
      <DevUiRow>
        {PHASES.map((phase) => (
          <PhaseRail key={phase} phase={phase} size="sm" />
        ))}
      </DevUiRow>
    </DevUiFrame>
  );
}

/** Section 4 de la galerie : composants signature (S-dev-ui §3). */
export function DevUiSignature() {
  return (
    <DevUiSection id="dev-ui-signature" title="4. Composants signature">
      <Entities />
      <Buttons />
      <Alerts />
      <DevUiFrame title="Bloc d'envoi" wide>
        <AiSendPolicy />
        <AiSendPolicy variant="reminder" />
      </DevUiFrame>
      <DevUiFrame title="EmptyState">
        <EmptyState
          icon="lightbulb"
          title="Aucune idée encore"
          description="Racontez le projet en quelques phrases, l'agent vous aide à le structurer."
          action={
            <Button onClick={noop}>
              <Icon name="edit" size={20} />
              Commencer le dossier
            </Button>
          }
        />
      </DevUiFrame>
      <Phases />
    </DevUiSection>
  );
}
