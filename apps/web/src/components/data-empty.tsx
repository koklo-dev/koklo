"use client";

import { Button, EmptyState, formatCount } from "@koklo/ui";
import type { ReactElement } from "react";

const count = (n: number, one: string, other: string): string =>
  `${formatCount(n)} ${n === 1 ? one : other}`;

export interface FunctionalCounts {
  features: number;
  rules: number;
  roles: number;
  flows: number;
}

/** « 7 fonctionnalités, 4 règles, 3 rôles, 2 parcours » : ce que l'agent lira (compteurs réels du cahier, maquette 11 l.95). */
export function functionalSummary(counts: FunctionalCounts): string {
  return [
    count(counts.features, "fonctionnalité", "fonctionnalités"),
    count(counts.rules, "règle", "règles"),
    count(counts.roles, "rôle", "rôles"),
    count(counts.flows, "parcours", "parcours"),
  ].join(", ");
}

/** Prêt (maquette 11 l.91-103) : l'agent peut proposer le modèle depuis le cahier fonctionnel enregistré. */
export function DataReady({
  agent,
  counts,
  onCreate,
}: {
  agent: ReactElement;
  counts: FunctionalCounts;
  onCreate: () => void;
}) {
  return (
    <div className="mx-auto mt-8 flex w-full max-w-[560px] flex-col gap-3 px-4">
      <EmptyState
        icon="database"
        title="L'agent peut proposer le modèle de données"
        description={`À partir du cahier fonctionnel enregistré : ${functionalSummary(counts)}. Il propose les tables, leurs champs et contraintes, les relations et des jeux de données d'exemple.`}
        wideDescription
        action={agent}
        secondaryAction={
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onCreate}>
            Ajouter une table
          </Button>
        }
      />
    </div>
  );
}

/** Aucune table et rien à proposer (designer, agent indisponible) : l'équipe qui écrit ajoute à la main. */
export function DataEmptyPlain({
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
      icon="table"
      title="Aucune table pour l'instant"
      description="Le modèle de données se construit depuis le cahier fonctionnel : tables, champs, relations."
      {...(canWrite
        ? {
            action: (
              <Button type="button" className="h-11 md:h-9" onClick={onCreate}>
                Ajouter une table
              </Button>
            ),
          }
        : {})}
    />
  );
}
