import type { StatusFacts } from "../spec-deliverables/deliverable-statuses.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { entityHashesOf } from "./entity-hashes.ts";
import { VERDICT_SELECT } from "./verdicts.ts";

/** Cibles dont les reviews comptent pour les statuts de livrable et la progression du client. */
const TARGET_KINDS = ["feature", "flow", "rules", "roles", "deliverable"] as const;

/**
 * Faits d'une tête de spec nécessaires aux statuts : entités indexées, fonctionnalités, et reviews du projet sur les cibles
 * validables. Une seule définition, lue par les statuts de livrable, la progression du client et la garde de « Valider le
 * cahier ».
 */
export async function readStatusFacts(
  tx: Tx,
  scope: ProjectScope,
  snapshot: { id: string; commitSha: string },
): Promise<StatusFacts> {
  const entities = await entityHashesOf(tx, snapshot.id);
  const features = await tx.specFeature.findMany({
    where: { snapshotId: snapshot.id },
    select: { specId: true },
  });
  const reviews = await tx.review.findMany({
    where: { projectId: scope.projectId, targetKind: { in: [...TARGET_KINDS] } },
    select: VERDICT_SELECT,
  });
  return {
    headSha: snapshot.commitSha,
    entities,
    featureIds: features.map((feature) => feature.specId),
    reviews,
  };
}
