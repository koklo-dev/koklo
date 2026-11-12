import {
  deliverableStatusesOf,
  elementTargets,
  type StatusFacts,
  type Target,
  targetStateReader,
} from "../spec-deliverables/deliverable-statuses.ts";
import { compareFeatures } from "../spec-read/feature-page.ts";
import type { Validation } from "./validation.ts";

export type ClientTargetKind = "feature" | "flow" | "rules" | "roles";
const TAB_ORDER: readonly ClientTargetKind[] = ["feature", "flow", "rules", "roles"];

/** Compteurs d'un onglet : éléments affichés, unités à traiter, traitées et demandes de changement d'actualité. */
export interface TabProgress {
  count: number;
  units: number;
  treated: number;
  toRevise: number;
}

export interface ClientProgress {
  tabs: { features: TabProgress; flows: TabProgress; rules: TabProgress; roles: TabProgress };
  untreated: number;
  toRevise: number;
  changed: number;
  next: { kind: ClientTargetKind; ref: string } | null;
  /** Statut du cahier entier (livrable Fonctionnel). */
  validation: Validation;
}

const emptyTab = (): TabProgress => ({ count: 0, units: 0, treated: 0, toRevise: 0 });

/** Ordre de lecture des unités : fonctionnalités en ordre numérique, puis parcours, règles, rôles. */
function ordered(targets: readonly Target[]): Target[] {
  const rank = (kind: string) => TAB_ORDER.indexOf(kind as ClientTargetKind);
  return [...targets].sort(
    (a, b) =>
      rank(a[0]) - rank(b[0]) ||
      (a[0] === "feature"
        ? compareFeatures({ specId: a[1] }, { specId: b[1] })
        : a[1].localeCompare(b[1])),
  );
}

const COHORT = { feature: "features", flow: "flows", rules: "rules", roles: "roles" } as const;

/**
 * Progression du client sur le cahier fonctionnel (B347) : une unité = une fonctionnalité, un parcours, le bloc des règles
 * ou le bloc des rôles. « Traitée » = validée ou avec une demande de changement d'actualité ; « modifiée » = validée puis
 * changée depuis. `counts` donne le nombre d'éléments que montrent les onglets règles et rôles (un bloc = une unité).
 */
export function progressOf(
  facts: StatusFacts,
  counts: { rules: number; roles: number } = { rules: 0, roles: 0 },
): ClientProgress {
  const stateOf = targetStateReader(facts);
  const tabs = {
    features: emptyTab(),
    flows: emptyTab(),
    rules: { ...emptyTab(), count: counts.rules },
    roles: { ...emptyTab(), count: counts.roles },
  };
  let untreated = 0;
  let toRevise = 0;
  let changed = 0;
  let next: ClientProgress["next"] = null;
  for (const target of ordered(elementTargets("functional", facts))) {
    const [kind, ref] = target as readonly [ClientTargetKind, string];
    const tab = tabs[COHORT[kind]];
    const state = stateOf(target);
    tab.units += 1;
    if (kind === "feature" || kind === "flow") tab.count += 1;
    if (state.previouslyValidated) changed += 1;
    if (state.validation === "to_validate") {
      untreated += 1;
      next ??= { kind, ref };
      continue;
    }
    tab.treated += 1;
    if (state.validation === "to_revise") {
      tab.toRevise += 1;
      toRevise += 1;
    }
  }
  const status = deliverableStatusesOf(facts).functional;
  const validation =
    status === "validated" ? "validated" : status === "revise" ? "to_revise" : "to_validate";
  return { tabs, untreated, toRevise, changed, next, validation };
}

/**
 * Garde de « Valider le cahier » et d'« Envoyer mes demandes » (B351) : tout doit être traité ; valider exige en plus
 * aucune demande d'actualité, envoyer en exige au moins une.
 */
export function isCahierComplete(
  progress: Pick<ClientProgress, "untreated" | "toRevise">,
  decision: "approved" | "changes_requested",
): boolean {
  if (progress.untreated > 0) return false;
  return decision === "approved" ? progress.toRevise === 0 : progress.toRevise > 0;
}
