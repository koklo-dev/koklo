import type { Prisma } from "@koklo/db";
import { type Validation, validationOf } from "../client-space/validation.ts";
import { featureHashesOf } from "../review/entity-hashes.ts";
import { groupByTarget, VERDICT_SELECT, verdictOf } from "../review/verdicts.ts";
import type { Tx } from "../tracker/project-transactions.ts";

/**
 * Validation par fonctionnalité (TK-102, contrat 3.0.0) : la dernière review de la cible `feature`, jugée sur le contenu
 * courant (hachage de l'entité, à défaut SHA de tête), comme `spec.deliverables` et `spec.item.get`. Seules les
 * fonctionnalités qui ont au moins une review sont lues : toutes les autres sont « à valider », sans lecture.
 */
export type FeatureValidations = ReadonlyMap<string, Validation>;

export const NO_VALIDATIONS: FeatureValidations = new Map();

/** Validation de chaque fonctionnalité qui a une review dans le projet ; `headSha` est la tête de l'instantané lu. */
export async function readFeatureValidations(
  tx: Tx,
  projectId: string,
  snapshot: { id: string; commitSha: string },
): Promise<FeatureValidations> {
  const reviews = await tx.review.findMany({
    where: { projectId, targetKind: "feature" },
    select: VERDICT_SELECT,
  });
  if (reviews.length === 0) return NO_VALIDATIONS;
  const groups = groupByTarget(reviews);
  const specIds = [...new Set(reviews.map((review) => review.targetRef))];
  const hashes = (await featureHashesOf(tx, [snapshot.id], specIds)).get(snapshot.id);
  const result = new Map<string, Validation>();
  for (const specId of specIds) {
    const verdict = verdictOf(groups.get(`feature:${specId}`) ?? [], hashes?.get(specId) ?? null);
    result.set(specId, validationOf(verdict, snapshot.commitSha).validation);
  }
  return result;
}

export const validationOfFeature = (validations: FeatureValidations, specId: string): Validation =>
  validations.get(specId) ?? "to_validate";

const idsWith = (validations: FeatureValidations, wanted: (value: Validation) => boolean) =>
  [...validations].filter(([, value]) => wanted(value)).map(([specId]) => specId);

/**
 * Filtre serveur sur la liste entière : « à valider » est le complément des fonctionnalités dont la validation est
 * connue et autre ; les deux autres valeurs sont les identifiants lus.
 */
export function validationWhere(
  validations: FeatureValidations,
  wanted: Validation | undefined,
): Prisma.SpecFeatureWhereInput {
  if (wanted === undefined) return {};
  if (wanted === "to_validate") {
    return { specId: { notIn: idsWith(validations, (value) => value !== "to_validate") } };
  }
  return { specId: { in: idsWith(validations, (value) => value === wanted) } };
}

/**
 * Comptes par validation sur les fonctionnalités qui passent les autres filtres (`passing` ignore le filtre de
 * validation) : les validations lues sont comptées une à une, le reste de `total` est « à valider ».
 */
export async function validationFacets(
  tx: Tx,
  passing: Prisma.SpecFeatureWhereInput,
  validations: FeatureValidations,
): Promise<Record<string, number>> {
  const total = await tx.specFeature.count({ where: passing });
  const known = await tx.specFeature.findMany({
    where: { AND: [passing, { specId: { in: [...validations.keys()] } }] },
    select: { specId: true },
  });
  const counts: Record<string, number> = {};
  for (const { specId } of known) {
    const value = validationOfFeature(validations, specId);
    if (value !== "to_validate") counts[value] = (counts[value] ?? 0) + 1;
  }
  const pending = total - Object.values(counts).reduce((sum, n) => sum + n, 0);
  return pending > 0 ? { ...counts, to_validate: pending } : counts;
}
