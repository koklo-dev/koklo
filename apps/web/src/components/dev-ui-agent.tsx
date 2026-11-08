"use client";

import {
  AgentComposer,
  AgentGapsCard,
  AgentPanel,
  AgentPrivacyNote,
  ChatBubble,
  DecisionNotice,
  InlineAlert,
  ProposalDiff,
  ProposedPageList,
} from "@koklo/ui";
import { useState } from "react";
import { DevUiFrame, DevUiRow, DevUiSection } from "./dev-ui-frame.tsx";

const GAPS = [
  { id: "g1", file: "02-probleme.md", text: "ne dit pas qui paie.", kind: "page" as const },
  { id: "g2", text: "Aucune page sur la concurrence.", kind: "new-page" as const },
];

const PAGES = ["Concurrence et alternatives", "Contraintes", "Risques", "Planning"].map(
  (title, i) => ({ id: `p${i}`, title, rationale: "Marie cite 3 concurrents dans Problème." }),
);

const noop = () => undefined;

/** Section « Agent de l'espace Idée » de la galerie (TK-90, DESIGN.md §5.9). */
export function DevUiAgent() {
  const [mode, setMode] = useState<"interview" | "free">("interview");
  const [text, setText] = useState("");
  return (
    <DevUiSection id="dev-ui-agent" title="13. Agent de l'espace Idée">
      <DevUiFrame title="Panneau, fil, manques et saisie">
        <AgentPanel
          mode={mode}
          onModeChange={setMode}
          className="w-[380px] max-w-full border"
          footer={
            <>
              <AgentComposer value={text} onValueChange={setText} onSend={noop} />
              <p className="text-caption text-muted-foreground">
                Envoyé au fournisseur d'IA de l'organisation, avec sa clé.
              </p>
            </>
          }
        >
          <ChatBubble author="agent" name="Agent">
            Qui paie le portail, le client final ou la clinique ?
          </ChatBubble>
          <ChatBubble author="human" name="Marie Lefèvre (client)">
            La clinique. Les clients réservent gratuitement.
          </ChatBubble>
          <AgentGapsCard items={GAPS} onAction={noop} />
        </AgentPanel>
      </DevUiFrame>
      <DevUiFrame title="Saisie pendant le flux">
        <div className="w-[380px] max-w-full">
          <AgentComposer value="" onValueChange={noop} onSend={noop} onStop={noop} streaming />
        </div>
      </DevUiFrame>
      <DevUiFrame title="Proposition sur place" wide>
        <div className="flex max-w-[680px] flex-col gap-3">
          <ProposalDiff
            op="insert_after"
            rationale="suite à la réponse de Marie"
            onAccept={noop}
            onEdit={noop}
            onReject={noop}
            position={{ index: 0, total: 3, onNavigate: noop }}
          >
            <h3 className="text-subsection-title">Hors périmètre</h3>
            <p>Paiement en ligne : le paiement se fait sur place au lancement.</p>
          </ProposalDiff>
          <ProposalDiff
            op="replace"
            rationale="plus précis"
            previous={<p>Le portail est rapide.</p>}
            onAccept={noop}
            onReject={noop}
          >
            <p>Réserver en moins de deux minutes depuis un téléphone.</p>
          </ProposalDiff>
          <ProposalDiff
            op="append"
            rationale="ancienne version"
            stale
            onAskAgain={noop}
            onAccept={noop}
            onReject={noop}
          >
            <p>Texte devenu caduc.</p>
          </ProposalDiff>
          <DecisionNotice onUndo={noop}>
            Section ajoutée par l'agent, acceptée par vous.
          </DecisionNotice>
        </div>
      </DevUiFrame>
      <DevUiFrame title="Pages proposées (3 visibles puis « N autres »)">
        <div className="w-[264px] max-w-full">
          <ProposedPageList items={PAGES} onAccept={noop} onIgnore={noop} />
        </div>
      </DevUiFrame>
      <DevUiFrame title="Mention de confidentialité (ligne nue, « Détails » déplie)">
        <div className="w-[348px] max-w-full">
          <AgentPrivacyNote
            details={
              <p>Seuls le texte de la page et vos messages sont envoyés, jamais de secret.</p>
            }
          >
            Envoyé au fournisseur d'IA de l'organisation, avec sa clé.
          </AgentPrivacyNote>
        </div>
      </DevUiFrame>
      <DevUiFrame title="Agent non configuré">
        <DevUiRow>
          <InlineAlert
            variant="neutral"
            icon="lock"
            action={{ label: "Configurer l'IA", onClick: noop }}
          >
            L'agent n'est pas encore activé : aucune clé d'IA n'est configurée.
          </InlineAlert>
        </DevUiRow>
      </DevUiFrame>
    </DevUiSection>
  );
}
