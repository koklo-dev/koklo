"use client";

import {
  Button,
  DocSectionLegend,
  DocSectionStatus,
  EmptyState,
  Icon,
  InlineAlert,
  ProposedPageCard,
  Prose,
  ProsePath,
  Skeleton,
} from "@koklo/ui";
import { useRef } from "react";
import {
  docGapsOf,
  markdownBlocks,
  markValidatedOperation,
  sectionNumber,
  selectedSectionOf,
} from "../lib/architecture-document.ts";
import { DOC_AGENT_ACTIONS } from "../lib/architecture-labels.ts";
import { buildSubmitInput } from "../lib/feature-operation.ts";
import { rateLimitedReadText } from "../lib/git-read-labels.ts";
import type { DocSection } from "../lib/use-architecture-document.ts";
import type { ArchitecturePageModel } from "../lib/use-architecture-page.ts";
import { useProposalActions } from "../lib/use-proposal-actions.ts";
import { ErrorNotice } from "./error-notice.tsx";

const OWNER = 4_200;

function Blocks({ markdown }: { markdown: string }) {
  return (
    <>
      {markdownBlocks(markdown).map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === "h") {
          return (
            <h3 key={key} className="text-subsection-title">
              {block.text}
            </h3>
          );
        }
        if (block.kind === "ul") {
          return (
            <ul key={key}>
              {block.items.map((item, at) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: puces d'un bloc en lecture, ordre fixe
                <li key={at}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={key}>{block.text}</p>;
      })}
    </>
  );
}

/** Colonne Sections : numéro mono, statut en icône, intitulé ; points « proposition en attente » ; légende collée en bas. */
function SectionsNav({
  page,
  sections,
  current,
}: {
  page: ArchitecturePageModel;
  sections: readonly DocSection[];
  current: DocSection | undefined;
}) {
  return (
    <nav
      aria-label="Sections du document"
      className="flex flex-col gap-0.5 border-border px-3 py-4 lg:w-[264px] lg:shrink-0 lg:border-r max-lg:border-b"
    >
      <div className="flex flex-col gap-0.5 px-2 pb-2.5">
        <span className="text-group-label uppercase text-muted-foreground">Sections</span>
        <span className="text-caption text-muted-foreground">
          {page.form.canWrite
            ? "Un fichier par section, dans l'ordre de leur numéro"
            : "Lecture seule"}
        </span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {sections.map((section) => {
          const open = section.slug === current?.slug;
          return (
            <li key={section.specId}>
              <button
                type="button"
                aria-current={open ? "page" : undefined}
                onClick={() => page.url.setSection(section.slug)}
                className={`flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-meta outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-11 ${
                  open ? "bg-background font-semibold ring-1 ring-border" : ""
                }`}
              >
                <span className="w-4 shrink-0 text-right font-mono text-code text-muted-foreground">
                  {sectionNumber(section.num)}
                </span>
                <DocSectionStatus status={section.status} display="icon" />
                <span
                  className={`min-w-0 flex-1 ${section.status === "a_rediger" ? "text-muted-foreground" : ""}`}
                >
                  {section.title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {page.propose.reviewing ? <SectionProposals page={page} /> : null}
      <DocSectionLegend className="mt-4 lg:mt-auto" />
    </nav>
  );
}

/** Sections proposées par l'agent (relecture) : « Ajouter la section » accepte, « Ignorer » rejette (maquette 13 l.256-262). */
function SectionProposals({ page }: { page: ArchitecturePageModel }) {
  const actions = useProposalActions(page.projectId, page.review, page.head?.branch);
  const pending = page.review.proposals.filter(
    (proposal) => proposal.kind === "doc_section" && proposal.status === "pending",
  );
  const busy = actions.saving;
  return (
    <>
      {pending.map((proposal) => (
        <ProposedPageCard
          key={proposal.id}
          label="section"
          title={String(proposal.content.title ?? proposal.title)}
          rationale={proposal.rationale}
          busy={busy}
          onAccept={() => void actions.decide(proposal.id, "accepted")}
          onIgnore={() => void actions.decide(proposal.id, "rejected")}
        />
      ))}
    </>
  );
}

function MarkValidated({
  page,
  section,
  commitSha,
}: {
  page: ArchitecturePageModel;
  section: DocSection;
  commitSha: string | undefined;
}) {
  const { write, head } = page;
  const busy = write.busy;
  const owner = useRef(OWNER);
  if (!head) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="underline max-md:h-11"
      disabled={busy}
      onClick={() =>
        write.submit({
          build: (idempotencyKey) =>
            buildSubmitInput(
              {
                projectId: page.projectId,
                idempotencyKey,
                branch: head.branch,
                ...(commitSha ? { baseSha: commitSha } : {}),
              },
              markValidatedOperation(section.specId),
            ),
          snapshot: JSON.stringify(["validate", section.specId]),
          meta: {
            owner: owner.current,
            kind: "update",
            specId: section.specId,
            title: section.title,
            status: "",
            priority: "",
            target: section.specId,
          },
        })
      }
    >
      Marquer comme validée
    </Button>
  );
}

/** Section à rédiger (maquette 13 l.296-300) : l'agent la rédige, ou l'équipe revient plus tard. */
function EmptySection({ page }: { page: ArchitecturePageModel }) {
  const canAsk = page.propose.enabled && page.form.canWrite;
  return (
    <EmptyState
      variant="callout"
      title="Section à rédiger"
      description="Personne n'a encore écrit cette section."
      {...(canAsk
        ? {
            action: (
              <Button
                type="button"
                className="h-11 md:h-8"
                onClick={() => page.propose.launch.prefill("document", "")}
              >
                <Icon name="wand_stars" size={18} />
                Rédiger avec l'agent
              </Button>
            ),
          }
        : {})}
    />
  );
}

/** Centre : chemin du fichier, titre, statut, « Marquer comme validée », texte (680 px au plus). */
function SectionBody({
  page,
  section,
  commitSha,
}: {
  page: ArchitecturePageModel;
  section: DocSection;
  commitSha: string | undefined;
}) {
  const canMark =
    page.form.canWrite && section.status !== "validee" && section.status !== "a_rediger";
  return (
    <article className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-6 md:px-10 md:pt-7 md:pb-12">
      <Prose className="mx-auto w-full max-w-[680px]">
        <div className="flex flex-col gap-2">
          <ProsePath>{section.path}</ProsePath>
          <h2 className="text-section-title">{section.title}</h2>
          <div className="flex flex-wrap items-center gap-2.5 text-meta text-muted-foreground">
            <DocSectionStatus status={section.status} display="pill" />
            {canMark ? <MarkValidated page={page} section={section} commitSha={commitSha} /> : null}
          </div>
        </div>
        {section.status === "a_rediger" && !section.markdown.trim() ? (
          <EmptySection page={page} />
        ) : (
          <Blocks markdown={section.markdown} />
        )}
      </Prose>
    </article>
  );
}

/** Colonne Agent (équipe, sous 1024 px elle se replie) : « Demander », « Ce qui manque encore ». Aucune conversation ici. */
function AgentColumn({
  page,
  sections,
}: {
  page: ArchitecturePageModel;
  sections: readonly DocSection[];
}) {
  const gaps = docGapsOf(sections);
  const canAsk = page.propose.enabled && page.form.canWrite;
  return (
    <aside
      aria-label="Agent"
      className="hidden w-[340px] shrink-0 flex-col border-l border-border bg-surface xl:flex"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"
        >
          <Icon name="wand_stars" size={18} />
        </span>
        <span className="font-semibold">Agent</span>
      </div>
      <div className="flex flex-col gap-3.5 p-4">
        {canAsk ? (
          <section aria-label="Actions rapides" className="flex flex-col gap-1.5">
            <span className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
              Demander
            </span>
            {DOC_AGENT_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => page.propose.launch.prefill(action.mode, action.instruction)}
                className="flex min-h-9 items-center gap-2.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-left text-meta outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon name={action.icon} size={18} className="shrink-0 text-primary" />
                <span className="flex-1">{action.label}</span>
              </button>
            ))}
          </section>
        ) : null}
        <section
          aria-label="Ce qui manque encore"
          className="flex flex-col gap-2.5 rounded-[10px] border border-border bg-background px-3.5 py-3"
        >
          <span className="text-meta font-semibold">Ce qui manque encore</span>
          {gaps.length === 0 ? (
            <span className="text-meta text-muted-foreground">Rien ne manque.</span>
          ) : (
            gaps.map((gap) => (
              <div key={gap} className="flex items-start gap-2.5 text-meta">
                <Icon
                  name="radio_button_unchecked"
                  size={18}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="flex-1">{gap}</span>
              </div>
            ))
          )}
        </section>
      </div>
    </aside>
  );
}

function DocumentSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-2 p-4 md:p-7">
      <span className="sr-only">Chargement du document…</span>
      {["a", "b", "c"].map((key) => (
        <Skeleton key={key} className="h-9 rounded-lg" />
      ))}
    </div>
  );
}

/**
 * Onglet Document (maquette 13 l.240-361) : colonne Sections de 264 (au-dessus du texte sous 1024 px), centre de 680
 * au plus, colonne Agent de 340 à 360 sans conversation. Les sections sont lues en Git (`spec.architecture.document`),
 * dans l'ordre de leur numéro ; la légende des statuts est collée en bas de la colonne.
 */
export function ArchitectureDocumentTab({ page }: { page: ArchitecturePageModel }) {
  const { document: doc, url } = page;
  if (doc.query.isError) {
    return (
      <div className="p-4 md:p-7">
        <ErrorNotice
          title="Impossible de charger le document"
          onRetry={() => void doc.query.refetch()}
        >
          {rateLimitedReadText(doc.query.error) ?? "Réessayez dans un instant."}
        </ErrorNotice>
      </div>
    );
  }
  if (!doc.loaded) return <DocumentSkeleton />;
  const current = selectedSectionOf(doc.sections, url.s);
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:min-h-[calc(100dvh-162px)] lg:flex-row">
      <SectionsNav page={page} sections={doc.sections} current={current} />
      {current ? (
        <SectionBody page={page} section={current} commitSha={doc.query.data?.commitSha} />
      ) : (
        <div className="min-w-0 flex-1 p-4 md:p-10">
          <InlineAlert variant="neutral" icon="info">
            Aucune section pour l'instant : l'agent peut rédiger le document d'architecture.
          </InlineAlert>
        </div>
      )}
      {page.team ? <AgentColumn page={page} sections={doc.sections} /> : null}
    </div>
  );
}
