import { randomUUID } from "node:crypto";
import type { ParsedSpec } from "@koklo/schema";

/** Plafond des fichiers reconnus d'un commit : au-delà, le snapshot est `failed` / `spec_too_large`. */
export const MAX_SPEC_FILES = 2000;
/** Plus grand `F-nnn` pris en compte pour le compteur (au-delà : indexé, jamais compté). */
export const FEATURE_COUNTER_MAX = 999_999;

const FEATURE_NUMBER = /^F-(\d+)$/;

export interface IndexRows {
  readonly features: readonly {
    id: string;
    specId: string;
    title: string;
    status: "brouillon" | "specifiee" | "implementee" | "adoptee";
    priority: "must" | "should" | "could" | "wont";
    filePath: string;
  }[];
  readonly criteria: readonly {
    id: string;
    featureId: string;
    specId: string;
    position: number;
    title: string;
  }[];
  readonly tableLinks: readonly { featureId: string; targetSpecId: string }[];
  readonly endpointLinks: readonly { featureId: string; targetSpecId: string }[];
  readonly tables: readonly { specId: string; filePath: string }[];
  readonly endpoints: readonly {
    specId: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    filePath: string;
  }[];
}

const links = (featureId: string, targets: readonly string[]) =>
  [...new Set(targets)].map((targetSpecId) => ({ featureId, targetSpecId }));

/**
 * Lignes d'index d'une spec analysée (sans organisation ni snapshot, ajoutés à l'écriture). Les
 * doublons internes à un fichier (critère ou lien répété) sont écartés : l'index ne doit jamais
 * échouer sur un contenu git, qui n'est pas fiable.
 */
export function rowsOf(spec: ParsedSpec): IndexRows {
  const features: IndexRows["features"][number][] = [];
  const criteria: IndexRows["criteria"][number][] = [];
  const tableLinks: IndexRows["tableLinks"][number][] = [];
  const endpointLinks: IndexRows["endpointLinks"][number][] = [];
  for (const { path, value } of spec.features) {
    const id = randomUUID();
    features.push({
      id,
      specId: value.id,
      title: value.titre,
      status: value.statut,
      priority: value.priorite,
      filePath: path,
    });
    const seen = new Set<string>();
    for (const criterion of value.criteres) {
      if (seen.has(criterion.id)) continue;
      seen.add(criterion.id);
      criteria.push({
        id: randomUUID(),
        featureId: id,
        specId: criterion.id,
        position: seen.size,
        title: criterion.titre,
      });
    }
    tableLinks.push(...links(id, value.tables));
    endpointLinks.push(...links(id, value.endpoints));
  }
  return {
    features,
    criteria,
    tableLinks,
    endpointLinks,
    tables: spec.tables.map(({ path, value }) => ({ specId: value.id, filePath: path })),
    endpoints: spec.endpoints.map(({ path, value }) => ({
      specId: value.id,
      method: value.methode,
      path: value.chemin,
      filePath: path,
    })),
  };
}

/**
 * Plus grand numéro `F-nnn` des features, borné à `FEATURE_COUNTER_MAX`, et nombre d'identifiants
 * ignorés parce qu'au-dessus. `undefined` s'il n'y a rien à relever.
 */
export function featureCounterOf(spec: ParsedSpec): { raiseTo?: number; skipped: number } {
  let raiseTo: number | undefined;
  let skipped = 0;
  for (const { value } of spec.features) {
    const digits = FEATURE_NUMBER.exec(value.id)?.[1];
    const number = digits === undefined ? Number.NaN : Number(digits);
    if (!(number <= FEATURE_COUNTER_MAX)) {
      skipped += 1;
    } else if (raiseTo === undefined || number > raiseTo) {
      raiseTo = number;
    }
  }
  return raiseTo === undefined ? { skipped } : { raiseTo, skipped };
}
