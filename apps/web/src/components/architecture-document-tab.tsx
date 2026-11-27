"use client";

import { markValidatedOperation } from "../lib/architecture-document.ts";
import { DOC_AGENT_ACTIONS } from "../lib/architecture-labels.ts";
import type { ArchitecturePageModel } from "../lib/use-architecture-page.ts";
import { DocumentAgentColumn, SpecDocumentTab } from "./spec-document-tab.tsx";

/**
 * Onglet Document de l'Architecture (maquette 13 l.240-361) : le document partagé (`SpecDocumentTab`) avec les
 * sections de `architecture/overview/`, sa relecture et la colonne Agent de l'équipe.
 */
export function ArchitectureDocumentTab({ page }: { page: ArchitecturePageModel }) {
  const { document: doc, url, projectId, write, head, propose, form } = page;
  const ask = propose.enabled && form.canWrite ? propose.launch.prefill : undefined;
  return (
    <SpecDocumentTab
      query={doc.query}
      loaded={doc.loaded}
      sections={doc.sections}
      commitSha={doc.query.data?.commitSha}
      selected={url.s}
      onSelect={url.setSection}
      writing={
        form.canWrite
          ? { projectId, write, head, markOperation: markValidatedOperation }
          : undefined
      }
      onDraft={ask ? () => ask("document", "") : undefined}
      proposals={
        propose.reviewing ? { projectId, review: page.review, branch: head?.branch } : undefined
      }
      emptyText="Aucune section pour l'instant : l'agent peut rédiger le document d'architecture."
      side={
        page.team
          ? () => (
              <DocumentAgentColumn
                sections={doc.sections}
                actions={DOC_AGENT_ACTIONS}
                onAsk={ask}
              />
            )
          : undefined
      }
    />
  );
}
