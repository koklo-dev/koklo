"use client";

import {
  Button,
  InlineAlert,
  ProposalGenerationBanner,
  ProposalReview,
  ProposalSkeleton,
  Skeleton,
} from "@koklo/ui";
import { errorCode } from "../lib/api-error.ts";
import { NO_ACCESS } from "../lib/proposal-labels.ts";
import { useProposalActions } from "../lib/use-proposal-actions.ts";
import { type ProposalReviewModel, useProposalReview } from "../lib/use-proposal-review.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { ReviewDetail } from "./features-review-detail.tsx";

const GENERATING =
  "L'agent rédige le cahier fonctionnel à partir du dossier d'idée. Cela peut prendre une minute. Vous pouvez quitter la page.";

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
function Generating({ onLeave }: { onLeave: () => void }) {
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
function placeholderOf(review: ProposalReviewModel, onLeave: () => void) {
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
  if (review.active) return <Generating onLeave={onLeave} />;
  return (
    <Notice title="Aucune proposition à relire" onLeave={onLeave}>
      Lancez l'agent depuis le bouton « Proposer avec l'agent ».
    </Notice>
  );
}

interface Notices {
  review: ProposalReviewModel;
  actions: ReturnType<typeof useProposalActions>;
  onLeave: () => void;
}

/** Avis au-dessus de la relecture : erreur d'action, récapitulatif d'enregistrement, attente, « tout est relu ». */
function ReviewNotices({ review, actions, onLeave }: Notices) {
  const { counts, active } = review;
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
        <ProposalGenerationBanner silent onLeave={onLeave}>
          {GENERATING}
        </ProposalGenerationBanner>
      ) : null}
      {counts.pending === 0 && counts.accepted > 0 && !active ? (
        <InlineAlert variant="neutral" icon="done_all">
          {`Tout est relu. Enregistrez les ${counts.accepted} acceptées.`}
        </InlineAlert>
      ) : null}
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
  onLeave,
}: {
  projectId: string;
  branch: string | undefined;
  onLeave: () => void;
}) {
  const review = useProposalReview(projectId, true);
  const actions = useProposalActions(projectId, review, branch);
  const { counts } = review;
  const placeholder = placeholderOf(review, onLeave);
  if (placeholder) return placeholder;
  const selected = actions.selected;
  const item = review.groups.flatMap((group) => group.items).find((i) => i.id === selected?.id);
  return (
    <div className="flex flex-col">
      <ReviewNotices review={review} actions={actions} onLeave={onLeave} />
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
        {...(review.savable.length > 0 ? { onSave: () => void actions.save() } : {})}
        saving={actions.saving}
        onLeave={onLeave}
        announcement={actions.announcement}
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
