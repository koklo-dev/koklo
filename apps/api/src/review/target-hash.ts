import { createHash } from "node:crypto";
import { DELIVERABLE_ENTITY_KINDS, type DeliverableKey } from "@koklo/domain";
import type { ReviewKind } from "./review-policy.ts";

/** Hachage de contenu d'une entité de la tête (`spec_entities`), écrit par le worker. */
export interface EntityHash {
  kind: string;
  specId: string;
  hash: string;
}

const compareEntities = (a: EntityHash, b: EntityHash) =>
  a.kind.localeCompare(b.kind) || a.specId.localeCompare(b.specId);

/** Hachage d'un ensemble d'éléments : ordre de lecture sans effet, chaque identifiant et chaque contenu y compte. */
function combine(entities: readonly EntityHash[]): string | null {
  if (entities.length === 0) return null;
  const text = [...entities]
    .sort(compareEntities)
    .map((entity) => `${entity.kind}:${entity.specId}:${entity.hash}`)
    .join("\n");
  return createHash("sha256").update(text).digest("hex");
}

const isDeliverableKey = (ref: string): ref is DeliverableKey => ref in DELIVERABLE_ENTITY_KINDS;

/**
 * Hachage courant d'une cible (B325 b, c) : élément = le hachage de l'entité ; `rules` = toutes les règles ; `roles` = le
 * fichier des rôles ; `deliverable` = tous les éléments du livrable. `null` : la cible n'existe pas dans la tête, ou n'est
 * pas hachée (la baseline se compare au SHA de tête).
 */
export function targetHashOf(
  entities: readonly EntityHash[],
  kind: ReviewKind,
  ref: string,
): string | null {
  if (kind === "baseline") return null;
  if (kind === "rules") return combine(entities.filter((entity) => entity.kind === "rule"));
  if (kind === "deliverable") {
    const kinds = isDeliverableKey(ref) ? DELIVERABLE_ENTITY_KINDS[ref] : [];
    return combine(entities.filter((entity) => kinds.includes(entity.kind)));
  }
  const found = entities.find((entity) => entity.kind === kind && entity.specId === ref);
  return found?.hash ?? null;
}
