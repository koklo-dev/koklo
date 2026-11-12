import { createHash } from "node:crypto";
import { canonicalize, type ParsedSpec, type SpecFile } from "@koklo/schema";

/** Genres indexés dans `spec_entities` : le CHECK de la migration porte la même liste. */
export type EntityKind =
  | "feature"
  | "rule"
  | "roles"
  | "flow"
  | "relations"
  | "table"
  | "endpoint"
  | "screen"
  | "test";

export interface EntityRow {
  readonly kind: EntityKind;
  readonly specId: string;
  readonly zone: "functional" | "data" | null;
  readonly path: string;
  readonly data: unknown;
  /** sha256 hexadécimal de la forme canonique du contenu (`{ kind, data }`) : ni chemin, ni mise en page. */
  readonly contentHash: string;
  readonly sort: number;
}

const ZONE_OF: Readonly<Record<EntityKind, EntityRow["zone"]>> = {
  feature: "functional",
  rule: "functional",
  roles: "functional",
  flow: "functional",
  table: "data",
  relations: "data",
  endpoint: null,
  screen: null,
  test: null,
};

/** Une valeur lue de git, ramenée à du JSON pur (propriétés `undefined` écartées) : le hachage ne dépend d'aucun type interne. */
const jsonOf = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const hashOf = (kind: EntityKind, data: unknown): string =>
  createHash("sha256").update(canonicalize({ kind, data })).digest("hex");

const stemOf = (path: string): string => (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");

const FLOW_ID = /^P-[A-Za-z0-9][A-Za-z0-9-]{0,62}$/;

/**
 * Identifiant d'un parcours (B325 g) : le `id` du JSON quand il est de la forme `P-…` et que le nom du fichier est cet
 * identifiant (ou commence par `<id>-`), sinon le nom du fichier sans extension.
 */
function flowIdOf(path: string, data: Record<string, unknown>): string {
  const stem = stemOf(path);
  const id = typeof data.id === "string" ? data.id : undefined;
  const matches =
    id !== undefined && FLOW_ID.test(id) && (stem === id || stem.startsWith(`${id}-`));
  return matches ? id : stem;
}

/** Parcours lisibles : JSON objet seulement ; le reste (JSON invalide, tableau, scalaire) est ignoré, jamais une erreur. */
function parsedFlows(
  files: readonly SpecFile[],
): { path: string; data: Record<string, unknown> }[] {
  return files.flatMap((file) => {
    try {
      const data: unknown = JSON.parse(file.content);
      const plain = data !== null && typeof data === "object" && !Array.isArray(data);
      return plain ? [{ path: file.path, data: data as Record<string, unknown> }] : [];
    } catch {
      return [];
    }
  });
}

type Candidate = { kind: EntityKind; specId: string; path: string; value: unknown };

function candidatesOf(spec: ParsedSpec, flows: readonly SpecFile[]): Candidate[] {
  const of = (
    kind: EntityKind,
    list: readonly { path: string; value: unknown }[],
    id: (entry: { path: string; value: unknown }) => string,
  ) =>
    list.map(
      (entry): Candidate => ({ kind, specId: id(entry), path: entry.path, value: entry.value }),
    );
  const idOf = (entry: { value: unknown }) => (entry.value as { id: string }).id;
  return [
    ...of("feature", spec.features, idOf),
    ...of("rule", spec.rules, idOf),
    ...of("roles", spec.roles, () => "roles"),
    ...parsedFlows(flows).map(
      (flow): Candidate => ({
        kind: "flow",
        specId: flowIdOf(flow.path, flow.data),
        path: flow.path,
        value: flow.data,
      }),
    ),
    ...of("table", spec.tables, idOf),
    ...of("relations", spec.relations, () => "relations"),
    ...of("endpoint", spec.endpoints, idOf),
    ...of("screen", spec.screens, idOf),
    ...of("test", spec.tests, (entry) => entry.path),
  ];
}

/**
 * Lignes `spec_entities` d'un commit : une par élément du modèle, plus les parcours JSON bruts. Le premier élément d'un
 * même (genre, identifiant) l'emporte (l'index ne doit jamais échouer sur un contenu git, qui n'est pas fiable). La mise
 * en page (`_layout.yaml`) et tout fichier hors modèle n'arrivent jamais ici (B11).
 */
export function entityRowsOf(spec: ParsedSpec, flows: readonly SpecFile[] = []): EntityRow[] {
  const seen = new Set<string>();
  const sorts = new Map<EntityKind, number>();
  const rows: EntityRow[] = [];
  for (const candidate of candidatesOf(spec, flows)) {
    const key = `${candidate.kind}:${candidate.specId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sort = sorts.get(candidate.kind) ?? 0;
    sorts.set(candidate.kind, sort + 1);
    const data = jsonOf(candidate.value);
    rows.push({
      kind: candidate.kind,
      specId: candidate.specId,
      zone: ZONE_OF[candidate.kind],
      path: candidate.path,
      data,
      contentHash: hashOf(candidate.kind, data),
      sort,
    });
  }
  return rows;
}
