"use client";

import type { SpecOperation } from "@koklo/contract";
import {
  Button,
  DocSectionLegend,
  DocSectionStatus,
  EmptyState,
  Icon,
  type IconName,
  InlineAlert,
  ProposalDiff,
  ProposedPageCard,
  Prose,
  ProsePath,
  Skeleton,
} from "@koklo/ui";
import { type ReactNode, useRef } from "react";
import {
  docGapsOf,
  markdownBlocks,
  sectionNumber,
  selectedSectionOf,
} from "../lib/architecture-document.ts";
import { buildSubmitInput } from "../lib/feature-operation.ts";
import { rateLimitedReadText } from "../lib/git-read-labels.ts";
import type { DocSection } from "../lib/use-architecture-document.ts";
import type { FeatureWrite } from "../lib/use-feature-submit.ts";
import { useProposalActions } from "../lib/use-proposal-actions.ts";
import type { ProposalReviewModel } from "../lib/use-proposal-review.ts";
import { ErrorNotice } from "./error-notice.tsx";

const OWNER = 4_200;

/** Section affichée : sans `path` (vue client), aucun chemin de fichier n'est montré. */
export type DocumentSection = Pick<
  DocSection,
  "specId" | "slug" | "num" | "title" | "status" | "markdown"
> & { path?: string | undefined };

/** Écriture d'une section : « Marquer comme validée » par un lot d'une opération. */
export interface DocumentWriting {
  projectId: string;
  write: FeatureWrite;
  head: { branch: string } | null;
  markOperation: (specId: string) => SpecOperation;
}

/** Relecture ouverte : propositions de sections, décidées sur place. */
export interface DocumentReview {
  projectId: string;
  review: ProposalReviewModel;
  branch: string | undefined;
}

export interface SpecDocumentProps {
  query: { isError: boolean; error: unknown; refetch: () => unknown };
  loaded: boolean;
  sections: readonly DocumentSection[];
  commitSha: string | undefined;
  /** Section demandée par l'adresse. */
  selected: string | undefined;
  onSelect: (slug: string) => void;
  /** Absent : lecture seule (designer, client). */
  writing?: DocumentWriting | undefined;
  /** « Rédiger avec l'agent » d'une section à rédiger ; absent quand l'agent n'est pas disponible. */
  onDraft?: (() => void) | undefined;
  proposals?: DocumentReview | undefined;
  /** Phrase affichée quand le document n'a aucune section. */
  emptyText: string;
  /** Colonne de droite (agent, ou questions du client). */
  side?: ((current: DocumentSection | undefined) => ReactNode) | undefined;
}

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

const specIdOf = (proposal: { content: Record<string, unknown> }): string =>
  typeof proposal.content.specId === "string" ? proposal.content.specId : "";

/** Propositions de sections en attente de la relecture ouverte. */
const pendingSections = ({ review }: DocumentReview) =>
  review.proposals.filter(
    (proposal) => proposal.kind === "doc_section" && proposal.status === "pending",
  );

/**
 * Sections nouvelles proposées par l'agent : « Ajouter la section » accepte, « Ignorer » rejette (maquette 13
 * l.256-262). La rédaction d'une section existante se décide dans son texte (maquette 14 l.340-360).
 */
function SectionProposals({
  proposals,
  sections,
}: {
  proposals: DocumentReview;
  sections: readonly DocumentSection[];
}) {
  const actions = useProposalActions(proposals.projectId, proposals.review, proposals.branch);
  const known = new Set(sections.map((section) => section.specId));
  return (
    <>
      {pendingSections(proposals)
        .filter((proposal) => !known.has(specIdOf(proposal)))
        .map((proposal) => (
          <ProposedPageCard
            key={proposal.id}
            label="section"
            title={String(proposal.content.title ?? proposal.title)}
            rationale={proposal.rationale}
            busy={actions.saving}
            onAccept={() => void actions.decide(proposal.id, "accepted")}
            onIgnore={() => void actions.decide(proposal.id, "rejected")}
          />
        ))}
    </>
  );
}

/** Rédaction proposée d'une section existante : acceptée ou rejetée sur place. */
function SectionDraft({
  proposals,
  section,
}: {
  proposals: DocumentReview;
  section: DocumentSection;
}) {
  const actions = useProposalActions(proposals.projectId, proposals.review, proposals.branch);
  const draft = pendingSections(proposals).find(
    (proposal) => specIdOf(proposal) === section.specId,
  );
  if (!draft) return null;
  return (
    <ProposalDiff
      op="draft"
      rationale={draft.rationale}
      busy={actions.saving}
      onAccept={() => void actions.decide(draft.id, "accepted")}
      onReject={() => void actions.decide(draft.id, "rejected")}
    >
      <div className="flex flex-col gap-2.5">
        <Blocks markdown={String(draft.content.markdown ?? "")} />
      </div>
    </ProposalDiff>
  );
}

/** Colonne Sections : numéro mono, statut en icône, intitulé ; points « proposition en attente » ; légende collée en bas. */
function SectionsNav({
  props,
  current,
}: {
  props: SpecDocumentProps;
  current: DocumentSection | undefined;
}) {
  return (
    <nav
      aria-label="Sections du document"
      className="flex flex-col gap-0.5 border-border px-3 py-4 lg:w-[264px] lg:shrink-0 lg:border-r max-lg:border-b"
    >
      <div className="flex flex-col gap-0.5 px-2 pb-2.5">
        <span className="text-group-label uppercase text-muted-foreground">Sections</span>
        <span className="text-caption text-muted-foreground">
          {props.writing ? "Un fichier par section, dans l'ordre de leur numéro" : "Lecture seule"}
        </span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {props.sections.map((section) => {
          const open = section.slug === current?.slug;
          return (
            <li key={section.specId}>
              <button
                type="button"
                aria-current={open ? "page" : undefined}
                onClick={() => props.onSelect(section.slug)}
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
      {props.proposals ? (
        <SectionProposals proposals={props.proposals} sections={props.sections} />
      ) : null}
      <DocSectionLegend className="mt-4 lg:mt-auto" />
    </nav>
  );
}

function MarkValidated({
  writing,
  section,
  commitSha,
}: {
  writing: DocumentWriting;
  section: DocumentSection;
  commitSha: string | undefined;
}) {
  const { write, head, projectId } = writing;
  const owner = useRef(OWNER);
  if (!head) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="underline max-md:h-11"
      disabled={write.busy || write.behind}
      onClick={() =>
        write.submit({
          build: (idempotencyKey) =>
            buildSubmitInput(
              {
                projectId,
                idempotencyKey,
                branch: head.branch,
                ...(commitSha ? { baseSha: commitSha } : {}),
              },
              writing.markOperation(section.specId),
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
            direct: true,
          },
        })
      }
    >
      Marquer comme validée
    </Button>
  );
}

/** Section à rédiger (maquette 13 l.296-300) : l'agent la rédige, ou l'équipe revient plus tard. */
function EmptySection({ onDraft }: { onDraft: (() => void) | undefined }) {
  return (
    <EmptyState
      variant="callout"
      title="Section à rédiger"
      description="Personne n'a encore écrit cette section."
      {...(onDraft
        ? {
            action: (
              <Button type="button" className="h-11 md:h-8" onClick={onDraft}>
                <Icon name="wand_stars" size={18} />
                Rédiger avec l'agent
              </Button>
            ),
          }
        : {})}
    />
  );
}

const canMark = ({ status }: DocumentSection): boolean =>
  status !== "validee" && status !== "a_rediger";

/** Centre : chemin du fichier, titre, statut, « Marquer comme validée », texte (680 px au plus). */
function SectionBody({ props, section }: { props: SpecDocumentProps; section: DocumentSection }) {
  const { writing, proposals, commitSha } = props;
  const empty = section.status === "a_rediger" && !section.markdown.trim();
  return (
    <article className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-6 md:px-10 md:pt-7 md:pb-12">
      <Prose className="mx-auto w-full max-w-[680px]">
        <div className="flex flex-col gap-2">
          {section.path ? <ProsePath>{section.path}</ProsePath> : null}
          <h2 className="text-section-title">{section.title}</h2>
          <div className="flex flex-wrap items-center gap-2.5 text-meta text-muted-foreground">
            <DocSectionStatus status={section.status} display="pill" />
            {writing && canMark(section) ? (
              <MarkValidated writing={writing} section={section} commitSha={commitSha} />
            ) : null}
          </div>
        </div>
        {empty ? <EmptySection onDraft={props.onDraft} /> : <Blocks markdown={section.markdown} />}
        {proposals ? <SectionDraft proposals={proposals} section={section} /> : null}
      </Prose>
    </article>
  );
}

export interface DocumentAction {
  icon: IconName;
  label: string;
  mode: string;
  instruction: string;
}

/** Colonne Agent (équipe, sous 1280 px elle se replie) : « Demander », « Ce qui manque encore ». Aucune conversation ici. */
export function DocumentAgentColumn({
  sections,
  actions,
  onAsk,
}: {
  sections: readonly DocumentSection[];
  actions: readonly DocumentAction[];
  /** Absent : l'agent n'est pas proposé (designer, agent indisponible). */
  onAsk?: ((mode: string, instruction: string) => void) | undefined;
}) {
  const gaps = docGapsOf(sections);
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
        {onAsk ? (
          <section aria-label="Actions rapides" className="flex flex-col gap-1.5">
            <span className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
              Demander
            </span>
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => onAsk(action.mode, action.instruction)}
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
 * Document d'un livrable (maquettes 13 l.240-361 et 14 l.302-423) : colonne Sections de 264 (au-dessus du texte sous
 * 1024 px), centre de 680 au plus, colonne de droite. Les sections sont lues en Git, dans l'ordre de leur numéro ; la
 * légende des statuts est collée en bas de la colonne.
 */
export function SpecDocumentTab(props: SpecDocumentProps) {
  const { query, sections, selected } = props;
  if (query.isError) {
    return (
      <div className="p-4 md:p-7">
        <ErrorNotice title="Impossible de charger le document" onRetry={() => void query.refetch()}>
          {rateLimitedReadText(query.error) ?? "Réessayez dans un instant."}
        </ErrorNotice>
      </div>
    );
  }
  if (!props.loaded) return <DocumentSkeleton />;
  const current = selectedSectionOf(sections, selected);
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:min-h-[calc(100dvh-162px)] lg:flex-row">
      <SectionsNav props={props} current={current} />
      {current ? (
        <SectionBody key={current.specId} props={props} section={current} />
      ) : (
        <div className="min-w-0 flex-1 p-4 md:p-10">
          <InlineAlert variant="neutral" icon="info">
            {props.emptyText}
          </InlineAlert>
        </div>
      )}
      {props.side?.(current)}
    </div>
  );
}
