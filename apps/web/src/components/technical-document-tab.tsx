"use client";

import { markValidatedOperation } from "../lib/architecture-document.ts";
import { DOC_ACTIONS } from "../lib/technical-labels.ts";
import type { TechnicalPageModel } from "../lib/use-technical-page.ts";
import { DocumentAgentColumn, SpecDocumentTab } from "./spec-document-tab.tsx";

const EMPTY = "Aucune section pour l'instant : l'agent peut rédiger le cahier technique.";

/** « Marquer comme validée » d'une section du cahier technique. */
const markOperation = (specId: string) => ({
  ...markValidatedOperation(specId),
  deliverable: "technical" as const,
});

/**
 * Onglet Document du cahier technique (maquette 14 l.302-423) : sections de `tech/cahier-technique/`, rédaction
 * proposée sur place et colonne Agent. Ni ajout de section, ni éditeur, ni fil libre (TK-116 et suivants).
 */
export function TechnicalDocumentTab({ page }: { page: TechnicalPageModel }) {
  const { document: doc, url, projectId, write, head, propose, form, review } = page;
  const ask = propose.enabled && form.canWrite ? propose.launch.prefill : undefined;
  return (
    <SpecDocumentTab
      query={doc.query}
      loaded={doc.loaded}
      sections={doc.sections}
      commitSha={doc.query.data?.commitSha}
      selected={url.s}
      onSelect={url.setSection}
      writing={form.canWrite ? { projectId, write, head, markOperation } : undefined}
      onDraft={ask ? () => ask("complete", DOC_ACTIONS[0].instruction) : undefined}
      proposals={propose.reviewing ? { projectId, review, branch: head?.branch } : undefined}
      emptyText={EMPTY}
      side={() => <DocumentAgentColumn sections={doc.sections} actions={DOC_ACTIONS} onAsk={ask} />}
    />
  );
}
