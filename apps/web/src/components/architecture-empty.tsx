"use client";

import { Button, EmptyState } from "@koklo/ui";
import type { ReactElement } from "react";
import { ARCHITECTURE_READY_TEXT, ARCHITECTURE_READY_TITLE } from "../lib/architecture-labels.ts";

/** Prêt (maquette 13 l.90-102) : l'agent peut proposer l'architecture, ou l'équipe l'écrit à la main. */
export function ArchitectureReady({
  agent,
  onCreate,
}: {
  agent: ReactElement;
  onCreate: () => void;
}) {
  return (
    <div className="mx-auto mt-8 flex w-full max-w-[580px] flex-col gap-3 px-4">
      <EmptyState
        icon="account_tree"
        title={ARCHITECTURE_READY_TITLE}
        description={ARCHITECTURE_READY_TEXT}
        wideDescription
        action={agent}
        secondaryAction={
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onCreate}>
            Écrire à la main
          </Button>
        }
      />
    </div>
  );
}

/** Aucun composant et rien à proposer (designer, agent indisponible) : l'équipe qui écrit ajoute à la main. */
export function ArchitectureEmptyPlain({
  canWrite,
  onCreate,
}: {
  canWrite: boolean;
  onCreate: () => void;
}) {
  return (
    <EmptyState
      variant="inline"
      bordered
      icon="widgets"
      title="Aucun composant pour l'instant"
      description="L'architecture se construit depuis le cahier fonctionnel et le modèle de données : composants, flux, décisions."
      {...(canWrite
        ? {
            action: (
              <Button type="button" className="h-11 md:h-9" onClick={onCreate}>
                Nouveau composant
              </Button>
            ),
          }
        : {})}
    />
  );
}
