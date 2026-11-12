import { randomUUID } from "node:crypto";
import type { ParsedSpec, SpecFile } from "@koklo/schema";
import { type EntityRow, entityRowsOf } from "./entity-rows.ts";

/** Plafond des fichiers reconnus d'un commit : au-delà, le snapshot est `failed` / `spec_too_large`. */
export const MAX_SPEC_FILES = 2000;
/** Plus grand `F-nnn` pris en compte pour le compteur (au-delà : indexé, jamais compté). */
export const FEATURE_COUNTER_MAX = 999_999;

const FEATURE_NUMBER = /^F-(\d+)$/;
const RULE_NUMBER = /^R-(\d+)$/;

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
  /** Index d'entités générique (TK-100) : un élément du modèle par ligne, avec son hachage de contenu. */
  readonly entities: readonly EntityRow[];
}

const links = (featureId: string, targets: readonly string[]) =>
  [...new Set(targets)].map((targetSpecId) => ({ featureId, targetSpecId }));

/**
 * Lignes d'index d'une spec analysée (sans organisation ni snapshot, ajoutés à l'écriture). Les
 * doublons internes à un fichier (critère ou lien répété) sont écartés : l'index ne doit jamais
 * échouer sur un contenu git, qui n'est pas fiable.
 */
export function rowsOf(spec: ParsedSpec, flows: readonly SpecFile[] = []): IndexRows {
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
    entities: entityRowsOf(spec, flows),
  };
}

/** Plus grand numéro d'une liste d'identifiants `<préfixe>-nnn`, borné à `FEATURE_COUNTER_MAX` ; le reste est compté ignoré. */
function counterOf(ids: readonly string[], pattern: RegExp): { raiseTo?: number; skipped: number } {
  let raiseTo: number | undefined;
  let skipped = 0;
  for (const id of ids) {
    const digits = pattern.exec(id)?.[1];
    const number = digits === undefined ? Number.NaN : Number(digits);
    if (!(number <= FEATURE_COUNTER_MAX)) {
      skipped += 1;
    } else if (raiseTo === undefined || number > raiseTo) {
      raiseTo = number;
    }
  }
  return raiseTo === undefined ? { skipped } : { raiseTo, skipped };
}

/**
 * Plus grand numéro `F-nnn` des features, borné à `FEATURE_COUNTER_MAX`, et nombre d'identifiants
 * ignorés parce qu'au-dessus. `undefined` s'il n'y a rien à relever.
 */
export const featureCounterOf = (spec: ParsedSpec) =>
  counterOf(
    spec.features.map(({ value }) => value.id),
    FEATURE_NUMBER,
  );

/** Même relevé pour les règles `R-nnn` (compteur `rule`, TK-103). */
export const ruleCounterOf = (spec: ParsedSpec) =>
  counterOf(
    spec.rules.map(({ value }) => value.id),
    RULE_NUMBER,
  );
