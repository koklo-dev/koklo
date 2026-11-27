import { createHash } from "node:crypto";
import {
  type BusinessRule,
  canonicalize,
  type ParsedSpec,
  type SpecFile,
  STACK_LAYERS,
  type Stack,
} from "@koklo/schema";

/** Genres indexés dans `spec_entities` : le CHECK de la migration porte la même liste. */
export type EntityKind =
  | "feature"
  | "rule"
  | "roles"
  | "flow"
  | "relations"
  | "table"
  | "fixture"
  | "component"
  | "archflow"
  | "adr"
  | "endpoint"
  | "screen"
  | "test"
  | "stack"
  | "nfr"
  | "environments";

export interface EntityRow {
  readonly kind: EntityKind;
  readonly specId: string;
  readonly zone: "functional" | "data" | "architecture" | "technical" | null;
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
  fixture: "data",
  relations: "data",
  component: "architecture",
  archflow: "architecture",
  adr: "architecture",
  endpoint: null,
  screen: null,
  test: null,
  stack: "technical",
  nfr: "technical",
  environments: "technical",
};

/** Une valeur lue de git, ramenée à du JSON pur (propriétés `undefined` écartées) : le hachage ne dépend d'aucun type interne. */
const jsonOf = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const hashOf = (kind: EntityKind, data: unknown): string =>
  createHash("sha256").update(canonicalize({ kind, data })).digest("hex");

const stemOf = (path: string): string => (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");

const FLOW_ID = /^P-[A-Za-z0-9][A-Za-z0-9-]{0,62}$/;
const ROLES_TITLE = "Rôles et permissions";
const RULE_NUMBER = /^R-(\d+)$/;
const TITLE_MAX = 120;

/**
 * Identifiant d'un parcours JSON hérité (B325 g) : le `id` du JSON quand il est de la forme `P-…` et que le nom du fichier
 * est cet identifiant (ou commence par `<id>-`), sinon le nom du fichier sans extension.
 */
function flowIdOf(path: string, data: Record<string, unknown>): string {
  const stem = stemOf(path);
  const id = typeof data.id === "string" ? data.id : undefined;
  const matches =
    id !== undefined && FLOW_ID.test(id) && (stem === id || stem.startsWith(`${id}-`));
  return matches ? id : stem;
}

/** Parcours JSON hérités lisibles : objet JSON seulement ; le reste (JSON invalide, tableau, scalaire) est ignoré, jamais une erreur. */
function legacyFlows(
  files: readonly SpecFile[],
): { path: string; data: Record<string, unknown> }[] {
  return files.flatMap((file) => {
    if (!file.path.endsWith(".json")) return [];
    try {
      const data: unknown = JSON.parse(file.content);
      const plain = data !== null && typeof data === "object" && !Array.isArray(data);
      return plain ? [{ path: file.path, data: data as Record<string, unknown> }] : [];
    } catch {
      return [];
    }
  });
}

/** Titre d'une règle sans `titre` (fichiers d'avant TK-103) : la première phrase de l'énoncé, bornée. */
function titleOfStatement(statement: string): string {
  const first = statement.trim().split(/\n/, 1)[0] ?? "";
  const sentence = /^.*?[.!?](?=\s|$)/.exec(first)?.[0] ?? first;
  return sentence.slice(0, TITLE_MAX).trim();
}

const ruleNumber = (id: string): number =>
  Number(RULE_NUMBER.exec(id)?.[1] ?? Number.MAX_SAFE_INTEGER);

/** Règle indexée avec un `titre` (celui du fichier, sinon le début de l'énoncé) : recherche, listes et références. */
const withTitle = (rule: BusinessRule): BusinessRule => ({
  ...rule,
  titre: rule.titre ?? titleOfStatement(rule.enonce),
});

/** Table indexée avec un `titre` (B388) : son nom au format v2, son identifiant au format v1 (qui n'a pas de nom). */
const withName = <T extends { id: string }>(table: T): T & { titre: string } => ({
  ...table,
  titre: "nom" in table && typeof table.nom === "string" ? table.nom : table.id,
});

/** Composant indexé avec un `titre` (son nom) : recherche, listes et références. */
const withComponentTitle = <T extends { nom: string }>(component: T): T & { titre: string } => ({
  ...component,
  titre: component.nom,
});

/** Flux technique indexé avec un `titre` : l'identifiant du parcours qu'il détaille. */
const withFlowTitle = <T extends { id: string }>(flow: T): T & { titre: string } => ({
  ...flow,
  titre: flow.id,
});

type Candidate = { kind: EntityKind; specId: string; path: string; value: unknown };

const candidate =
  (kind: EntityKind, id: (entry: { path: string; value: unknown }) => string) =>
  (list: readonly { path: string; value: unknown }[]): Candidate[] =>
    list.map((entry) => ({ kind, specId: id(entry), path: entry.path, value: entry.value }));
const idOf = (entry: { value: unknown }) => (entry.value as { id: string }).id;

/** Composants, flux techniques et décisions (TK-111) : les deux premiers portent un `titre` d'index. */
function architectureCandidates(spec: ParsedSpec): Candidate[] {
  return [
    ...candidate(
      "component",
      idOf,
    )(spec.components.map(({ path, value }) => ({ path, value: withComponentTitle(value) }))),
    ...candidate(
      "archflow",
      idOf,
    )(spec.archFlows.map(({ path, value }) => ({ path, value: withFlowTitle(value) }))),
    ...candidate("adr", idOf)(spec.adrs),
  ];
}

const ENVIRONMENTS_TITLE = "Environnements";
const OPEN_CHOICE = "à trancher";

/** Choix indexés par couche puis identifiant, titrés « rôle : choix » (recherche et références). */
function stackCandidates(spec: ParsedSpec): Candidate[] {
  const rank = (stack: Stack) => STACK_LAYERS.indexOf(stack.couche);
  const sorted = [...spec.stacks].sort(
    (a, b) => rank(a.value) - rank(b.value) || (a.value.id < b.value.id ? -1 : 1),
  );
  const titled = sorted.map(({ path, value }) => ({
    path,
    value: { ...value, titre: `${value.role} : ${value.choix ?? OPEN_CHOICE}` },
  }));
  return candidate("stack", idOf)(titled);
}

/** Cahier technique (TK-115) : choix, opérations (titre = résumé), exigences et le bloc des environnements. */
function technicalCandidates(spec: ParsedSpec): Candidate[] {
  const operations = spec.operations.map(({ path, value }) => ({
    path,
    value: { ...value, titre: value.resume },
  }));
  const environments = spec.environments.map(({ path, value }) => ({
    path,
    value: { ...value, titre: ENVIRONMENTS_TITLE },
  }));
  return [
    ...stackCandidates(spec),
    ...candidate("endpoint", idOf)(operations),
    ...candidate("nfr", idOf)(spec.nfrs),
    ...candidate("environments", () => "environments")(environments),
  ];
}

function candidatesOf(spec: ParsedSpec, flows: readonly SpecFile[]): Candidate[] {
  const of = (
    kind: EntityKind,
    list: readonly { path: string; value: unknown }[],
    id: (entry: { path: string; value: unknown }) => string,
  ) => candidate(kind, id)(list);
  const rules = [...spec.rules].sort((a, b) => ruleNumber(a.value.id) - ruleNumber(b.value.id));
  return [
    ...of("feature", spec.features, idOf),
    ...of(
      "rule",
      rules.map(({ path, value }) => ({ path, value: withTitle(value) })),
      idOf,
    ),
    ...of(
      "roles",
      spec.roles.map(({ path, value }) => ({ path, value: { ...value, titre: ROLES_TITLE } })),
      () => "roles",
    ),
    ...of("flow", spec.flows, idOf),
    ...legacyFlows(flows).map(
      (flow): Candidate => ({
        kind: "flow",
        specId: flowIdOf(flow.path, flow.data),
        path: flow.path,
        value: flow.data,
      }),
    ),
    ...of(
      "table",
      spec.tables.map(({ path, value }) => ({ path, value: withName(value) })),
      idOf,
    ),
    ...of("fixture", spec.fixtures, idOf),
    ...architectureCandidates(spec),
    ...of("relations", spec.relations, () => "relations"),
    ...of("endpoint", spec.endpoints, idOf),
    ...technicalCandidates(spec),
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
