import {
  DELIVERABLE_ENTITY_KINDS,
  type DeliverableKey,
  deliverableStatusOf,
  type TargetValidation,
} from "@koklo/domain";
import { validationOf } from "../client-space/validation.ts";
import type { ReviewKind } from "../review/review-policy.ts";
import { type EntityHash, targetHashOf } from "../review/target-hash.ts";
import { groupByTarget, type VerdictRow, verdictOf } from "../review/verdicts.ts";
import type { DeliverableStatuses } from "./deliverable-status-source.ts";

export interface StatusFacts {
  headSha: string;
  /** Entités indexées de la tête (vide pour un snapshot d'avant TK-100). */
  entities: readonly EntityHash[];
  /** Fonctionnalités de la tête (`spec_features`), dont celles d'un snapshot pas encore réindexé. */
  featureIds: readonly string[];
  /** Reviews du projet sur les cibles validables (une cible peut en avoir plusieurs, la plus récente fait foi). */
  reviews: readonly VerdictRow[];
}

type Target = readonly [ReviewKind, string];

/** Cibles élément ou bloc d'un livrable : seul le Fonctionnel en a (parcours, règles, rôles, fonctionnalités). */
function elementTargets(key: DeliverableKey, facts: StatusFacts): Target[] {
  if (key !== "functional") return [];
  const features = new Set([
    ...facts.featureIds,
    ...facts.entities.filter((e) => e.kind === "feature").map((e) => e.specId),
  ]);
  const flows = facts.entities.filter((e) => e.kind === "flow").map((e) => e.specId);
  const targets: Target[] = [...features].map((id) => ["feature", id]);
  targets.push(...flows.map((id): Target => ["flow", id]));
  if (facts.entities.some((e) => e.kind === "rule")) targets.push(["rules", "rules"]);
  if (facts.entities.some((e) => e.kind === "roles")) targets.push(["roles", "roles"]);
  return targets;
}

/**
 * Statut des sept livrables d'après les validations sur le contenu courant (B325 b, c) : un livrable est « Validé » quand
 * lui-même, ou toutes ses cibles élément et bloc, sont validés sur le hachage courant ; « À revoir » si une demande de
 * changement est d'actualité ; « À faire » sans entité ; « À valider » sinon.
 */
export function deliverableStatusesOf(facts: StatusFacts): DeliverableStatuses {
  const groups = groupByTarget(facts.reviews);
  const validationOfTarget = ([kind, ref]: Target): TargetValidation => {
    const verdict = verdictOf(
      groups.get(`${kind}:${ref}`) ?? [],
      targetHashOf(facts.entities, kind, ref),
    );
    return verdict ? validationOf(verdict, facts.headSha).validation : "to_validate";
  };
  const statusOf = (key: DeliverableKey) => {
    const targets = elementTargets(key, facts);
    const kinds = DELIVERABLE_ENTITY_KINDS[key];
    return deliverableStatusOf({
      hasEntity: targets.length > 0 || facts.entities.some((e) => kinds.includes(e.kind)),
      targets: targets.map(validationOfTarget),
      whole: validationOfTarget(["deliverable", key]),
    });
  };
  return Object.fromEntries(
    (Object.keys(DELIVERABLE_ENTITY_KINDS) as DeliverableKey[]).map((key) => [key, statusOf(key)]),
  ) as DeliverableStatuses;
}

export const ALL_TODO: DeliverableStatuses = {
  functional: "todo",
  data: "todo",
  architecture: "todo",
  technical: "todo",
  security: "todo",
  design: "todo",
  quality: "todo",
};
