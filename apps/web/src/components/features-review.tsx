"use client";

import {
  Button,
  InlineAlert,
  ProposalGenerationBanner,
  ProposalReview,
  ProposalSkeleton,
  Skeleton,
} from "@koklo/ui";
import type { ReactNode } from "react";
import { errorCode } from "../lib/api-error.ts";
import { ARCHITECTURE_GENERATING } from "../lib/architecture-labels.ts";
import { launchDetailOf } from "../lib/launch-report.ts";
import { NO_ACCESS } from "../lib/proposal-labels.ts";
import { TECHNICAL_GENERATING } from "../lib/technical-labels.ts";
import { useProposalActions } from "../lib/use-proposal-actions.ts";
import {
  type ProposalReviewModel,
  type ReviewTab,
  useProposalReview,
} from "../lib/use-proposal-review.ts";
import { ArchitectureGenerating } from "./architecture-generating.tsx";
import { DataGenerating } from "./data-generating.tsx";
import { ErrorNotice } from "./error-notice.tsx";
import { ReviewDetail } from "./features-review-detail.tsx";
import { SaveFailureNotice } from "./save-failure-notice.tsx";
import { TechnicalGenerating } from "./technical-generating.tsx";

const GENERATING =
  "L'agent rédige le cahier fonctionnel à partir du dossier d'idée. Cela peut prendre une minute. Vous pouvez quitter la page.";

/** Maquette 11 l.106. */
export const DATA_GENERATING =
  "L'agent déduit les tables et les relations du cahier fonctionnel. Cela peut prendre une minute. Vous pouvez quitter la page.";

/**
 * « · l'agent propose 12 éléments depuis <source> · 3 acceptés · 7 à relire », avec « · K déjà présente(s) dans la
 * spec » avant « à relire » quand K ≥ 1 (B702).
 */
function agentSummary(source: string, counts: ProposalReviewModel["counts"]): string {
  const { total, accepted, pending, present } = counts;
  return [
    ` · l'agent propose ${total} ${total >= 2 ? "éléments" : "élément"} depuis ${source}`,
    `${accepted} ${accepted >= 2 ? "acceptés" : "accepté"}`,
    ...(present > 0
      ? [`${present} ${present >= 2 ? "déjà présentes" : "déjà présente"} dans la spec`]
      : []),
    `${pending} à relire`,
  ].join(" · ");
}

/** Données (maquette 11 l.115). */
export const dataSummary = (counts: ProposalReviewModel["counts"]): string =>
  agentSummary("le cahier fonctionnel", counts);

/** Architecture (maquette 13 l.113). */
export const architectureSummary = (counts: ProposalReviewModel["counts"]): string =>
  agentSummary("le fonctionnel et les données", counts);

/** Cahier technique (maquette 14 l.113). */
export const technicalSummary = (counts: ProposalReviewModel["counts"]): string =>
  agentSummary("l'architecture", counts);

/** Phrase du bandeau d'attente, résumé et note de groupe des livrables relus à part. */
const OWN_REVIEW = {
  data: { generating: DATA_GENERATING, summary: dataSummary, note: "Groupées par zone" },
  architecture: {
    generating: ARCHITECTURE_GENERATING,
    summary: architectureSummary,
    note: "Groupées par type",
  },
  technical: {
    generating: TECHNICAL_GENERATING,
    summary: technicalSummary,
    note: "Groupées par type",
  },
} as const;

const ownReviewOf = (tab: ReviewTab) =>
  Object.hasOwn(OWN_REVIEW, tab) ? OWN_REVIEW[tab as keyof typeof OWN_REVIEW] : undefined;

function Loading() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-2 p-4 md:p-7">
      <span className="sr-only">Chargement des propositions…</span>
      {["a", "b", "c"].map((key) => (
        <Skeleton key={key} className="h-11 rounded-lg" />
      ))}
    </div>
  );
}

/** Génération en cours, rien d'arrivé : bande d'état, « Annuler l'attente » (quitte l'attente seulement), 6 squelettes. */
function Generating({
  onLeave,
  tab,
  detail,
}: {
  onLeave: () => void;
  tab: ReviewTab;
  detail: string | undefined;
}) {
  if (tab === "data") return <DataGenerating onLeave={onLeave} />;
  if (tab === "architecture") return <ArchitectureGenerating onLeave={onLeave} detail={detail} />;
  if (tab === "technical") return <TechnicalGenerating onLeave={onLeave} />;
  return (
    <>
      <ProposalGenerationBanner onLeave={onLeave}>{GENERATING}</ProposalGenerationBanner>
      <ProposalSkeleton className="p-4 md:px-7" />
    </>
  );
}

function Notice({
  title,
  children,
  onLeave,
}: {
  title: string;
  children: string;
  onLeave: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 p-4 md:p-7">
      <p className="text-section-title">{title}</p>
      <p className="text-meta text-muted-foreground">{children}</p>
      <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onLeave}>
        Quitter la relecture
      </Button>
    </div>
  );
}

/** Texte de l'erreur d'une action écrite : 403 = « pas d'accès », le reste un message générique. */
const failureText = (error: unknown): string =>
  errorCode(error) === "FORBIDDEN" ? NO_ACCESS : "L'action a échoué. Réessayez dans un instant.";

/** Tout ce qui remplace la relecture : erreur de lecture, chargement, génération sans rien arrivé, rien à relire. */
function placeholderOf(review: ProposalReviewModel, onLeave: () => void, tab: ReviewTab) {
  if (review.error) {
    const forbidden = errorCode(review.error) === "FORBIDDEN";
    return (
      <div className="p-4 md:px-7">
        <ErrorNotice title="Relecture indisponible" onRetry={review.refetch}>
          {forbidden ? NO_ACCESS : "Impossible de lire les propositions."}
        </ErrorNotice>
      </div>
    );
  }
  if (!review.status.loaded) return <Loading />;
  if (review.counts.total > 0) return null;
  if (review.active) {
    return <Generating onLeave={onLeave} tab={tab} detail={launchDetailOf(review.status.launch)} />;
  }
  return (
    <Notice title="Aucune proposition à relire" onLeave={onLeave}>
      Lancez l'agent depuis le bouton « Proposer avec l'agent ».
    </Notice>
  );
}

/** Ligne de détail du bandeau (bilan en cours de l'Architecture, TK-114b) : seulement quand elle existe. */
const detailProp = (detail: string | undefined) => (detail ? { detail } : {});

/** « Enregistrer N dans la spec » : seulement sans enregistrement échoué, que l'alerte reprend (une seule action). */
export const saveProp = (
  review: ProposalReviewModel,
  actions: { save: () => Promise<void> },
): { onSave?: () => void } =>
  review.savable.length > 0 && !review.saveFailure ? { onSave: () => void actions.save() } : {};

interface Notices {
  tab: ReviewTab;
  review: ProposalReviewModel;
  actions: ReturnType<typeof useProposalActions>;
  onLeave: () => void;
}

/**
 * Avis au-dessus de la relecture : erreur d'action, récapitulatif d'enregistrement, attente, « tout est relu ».
 * L'enregistrement échoué à réessayer (B674) se place sous le bandeau, avant les groupes : `SaveFailureSlot`.
 */
function ReviewNotices({ review, actions, onLeave, tab }: Notices) {
  const { counts, active, saveFailure } = review;
  return (
    <div className="flex flex-col gap-2 px-4 pt-3 empty:hidden md:px-7">
      {actions.error ? <ErrorNotice>{failureText(actions.error)}</ErrorNotice> : null}
      {actions.summary ? (
        <InlineAlert variant="success" icon="check_circle">
          {actions.summary}
        </InlineAlert>
      ) : null}
      {active ? (
        // `ProposalReview` porte la région d'état de la relecture : le bandeau ne la double pas.
        <ProposalGenerationBanner
          silent
          onLeave={onLeave}
          {...detailProp(launchDetailOf(review.status.launch))}
        >
          {ownReviewOf(tab)?.generating ?? GENERATING}
        </ProposalGenerationBanner>
      ) : null}
      {counts.pending === 0 && counts.accepted > 0 && !active && !saveFailure ? (
        <InlineAlert variant="neutral" icon="done_all">
          {`Tout est relu. Enregistrez les ${counts.accepted} acceptées.`}
        </InlineAlert>
      ) : null}
    </div>
  );
}

/** Alerte d'enregistrement échoué sous le bandeau « Mode relecture », avant le bilan et les groupes (§16). */
function SaveFailureSlot({ review, actions }: Pick<Notices, "review" | "actions">) {
  if (!review.saveFailure || review.savable.length === 0) return null;
  return (
    <div className="mx-4 mt-4 md:mx-7">
      <SaveFailureNotice
        failure={review.saveFailure}
        saving={actions.saving}
        onRetry={() => void actions.save()}
      />
    </div>
  );
}

/**
 * Vue relecture de l'onglet Fonctionnalités (`?view=review`) : génération, relecture à plat (30 au plus) ou en
 * groupes, détail, enregistrement dans la spec. Rien n'est écrit sans le clic « Enregistrer ».
 */
export function FeaturesReview({
  projectId,
  branch,
  tab = "features",
  notice,
  onLeave,
}: {
  projectId: string;
  branch: string | undefined;
  /** Onglet affiché : la liste relit les propositions de son type (maquette 10 l.532) ; `data` : toutes celles des Données. */
  tab?: ReviewTab;
  /** Encadré sous le bandeau de relecture (avertissements d'architecture). */
  notice?: ReactNode;
  onLeave: () => void;
}) {
  const review = useProposalReview(projectId, true, tab);
  const actions = useProposalActions(projectId, review, branch);
  const { counts } = review;
  const placeholder = placeholderOf(review, onLeave, tab);
  if (placeholder) return placeholder;
  if (review.groups.length === 0) {
    return (
      <Notice title="Aucune proposition dans cet onglet" onLeave={onLeave}>
        Les propositions de l'agent sont dans les autres onglets.
      </Notice>
    );
  }
  const own = ownReviewOf(tab);
  const selected = actions.selected;
  const item = review.groups.flatMap((group) => group.items).find((i) => i.id === selected?.id);
  return (
    <div className="flex flex-col">
      <ReviewNotices tab={tab} review={review} actions={actions} onLeave={onLeave} />
      <ProposalReview
        counts={counts}
        groups={review.groups}
        filter={review.filter}
        onFilterChange={review.setFilter}
        selectedId={actions.selectedId}
        onSelect={actions.select}
        onDecide={(id, decision) => void actions.decide(id, decision)}
        onAcceptGroup={(key) => void actions.acceptGroup(key)}
        onLoadMore={review.loadMore}
        {...saveProp(review, actions)}
        saving={actions.saving}
        saveProgress={actions.saveProgress}
        onLeave={onLeave}
        {...(own ? { summaryText: own.summary(counts), groupNote: own.note } : {})}
        announcement={actions.announcement}
        notice={
          <>
            <SaveFailureSlot review={review} actions={actions} />
            {notice}
          </>
        }
      >
        {selected && item ? (
          <ReviewDetail
            key={selected.id}
            proposal={selected}
            item={item}
            onDecide={(id, decision, edited) => void actions.decide(id, decision, edited)}
            onRevise={(id, instruction) => void actions.revise(id, instruction)}
            reviseBusy={actions.reviseBusy}
            reviseError={actions.reviseError}
            announce={() => undefined}
          />
        ) : null}
      </ProposalReview>
    </div>
  );
}
