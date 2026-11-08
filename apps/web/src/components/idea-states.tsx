"use client";

import { Button, EmptyState, InlineAlert, Skeleton } from "@koklo/ui";

/** Erreur de lecture : une ligne et « Réessayer » (comme S-features). */
export function IdeaLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <InlineAlert variant="error" icon="error" action={{ label: "Réessayer", onClick: onRetry }}>
      Le dossier d'idée ne s'est pas chargé.
    </InlineAlert>
  );
}

/** Squelettes (mouvement réduit respecté par `Skeleton`) : arborescence et document. */
export function IdeaSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-1" data-testid="idea-loading">
      <div className="hidden w-[264px] shrink-0 flex-col gap-2 border-r px-3 py-4 lg:flex">
        {Array.from({ length: 10 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: squelette sans identité
          <Skeleton key={index} className="h-[34px] w-full" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-7 md:px-10">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

/** Dossier sans rien d'écrit : une phrase et l'ouverture de la première page, sans texte d'agent. */
export function IdeaEmpty({ onStart }: { onStart: () => void }) {
  return (
    <EmptyState
      icon="lightbulb"
      title="Aucune idée encore"
      description="Le dossier d'idée réunit la vision, le problème, les utilisateurs et le périmètre du projet."
      action={
        <Button type="button" className="h-11 md:h-9" onClick={onStart}>
          Commencer le dossier
        </Button>
      }
    />
  );
}
