import { InlineAlert, Skeleton } from "@koklo/ui";
import { PageBody } from "./page-body.tsx";

/** Chargement : fil, prochaine étape, indicateurs, bloc principal et colonne, `aria-busy` (S-overview §4). */
export function OverviewSkeleton() {
  return (
    <PageBody>
      <div data-testid="overview-skeleton" aria-busy="true" className="flex flex-col gap-6">
        <p role="status" className="sr-only">
          Chargement de la vue d'ensemble
        </p>
        <div aria-hidden="true" className="flex flex-col gap-6">
          <Skeleton className="h-[132px] rounded-xl" />
          <Skeleton className="h-[72px] rounded-xl" />
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            <Skeleton className="h-[108px] rounded-xl" />
            <Skeleton className="h-[108px] rounded-xl" />
            <Skeleton className="h-[108px] rounded-xl" />
            <Skeleton className="h-[108px] rounded-xl" />
          </div>
          <div className="flex flex-wrap items-start gap-6">
            <Skeleton className="h-[320px] min-w-0 flex-[999_1_460px] rounded-xl" />
            <div className="flex max-w-[420px] flex-[1_1_320px] flex-col gap-6">
              <Skeleton className="h-[260px] rounded-xl" />
              <Skeleton className="h-[160px] rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </PageBody>
  );
}

/** Erreur de chargement : l'en-tête et la barre restent utilisables (S-overview §4). */
export function OverviewError({
  onRetry,
  message = "Impossible de charger la vue d'ensemble.",
}: {
  onRetry: () => void;
  message?: string;
}) {
  return (
    <InlineAlert variant="error" icon="warning" action={{ label: "Réessayer", onClick: onRetry }}>
      {message}
    </InlineAlert>
  );
}
