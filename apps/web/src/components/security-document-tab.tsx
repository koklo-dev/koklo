"use client";

import { markValidatedOperation } from "../lib/architecture-document.ts";
import { DOC_ACTIONS, DOC_EMPTY } from "../lib/security-labels.ts";
import type { SecurityPageModel } from "../lib/use-security-page.ts";
import { DocumentAgentColumn, SpecDocumentTab } from "./spec-document-tab.tsx";

/** « Marquer comme validée » d'une section du dossier de sécurité. */
const markOperation = (specId: string) => ({
  ...markValidatedOperation(specId),
  deliverable: "security" as const,
});

/**
 * Onglet Document (maquette 15 l.217-338) : sections de `security/dossier/`, rédaction proposée sur place et colonne
 * Agent.
 */
export function SecurityDocumentTab({ page }: { page: SecurityPageModel }) {
  const { document: doc, url, projectId, write, head, propose, form, review } = page;
  const ask = propose.enabled && form.canWrite ? propose.launch.prefill : undefined;
  const draft = DOC_ACTIONS[0];
  return (
    <SpecDocumentTab
      query={doc.query}
      loaded={doc.loaded}
      sections={doc.sections}
      commitSha={doc.query.data?.commitSha}
      selected={url.s}
      onSelect={url.setSection}
      writing={form.canWrite ? { projectId, write, head, markOperation } : undefined}
      onDraft={ask ? () => ask(draft.mode, draft.instruction) : undefined}
      proposals={propose.reviewing ? { projectId, review, branch: head?.branch } : undefined}
      emptyText={DOC_EMPTY}
      side={() => <DocumentAgentColumn sections={doc.sections} actions={DOC_ACTIONS} onAsk={ask} />}
    />
  );
}
