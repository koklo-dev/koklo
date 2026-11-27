import { createHash } from "node:crypto";
import {
  type BusinessRule,
  canonicalize,
  NFR_CATEGORIES,
  type Nfr,
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
  | "environments"
  | "threat"
  | "sensitive"
  | "rights"
  | "asvs"
  | "security_summary";

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
  threat: null,
  sensitive: null,
  rights: null,
  asvs: null,
  security_summary: null,
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

const byId = (a: string, b: string) => a.localeCompare(b, "fr", { numeric: true });

/**
 * Opérations indexées par zone (ordre alphabétique) puis nom (B772), titrées par leur résumé ; `champs` garde l'ordre des
 * entrées et des sorties, que jsonb ne conserve pas.
 */
function operationCandidates(spec: ParsedSpec): Candidate[] {
  const sorted = [...spec.operations].sort(
    (a, b) => a.value.zone.localeCompare(b.value.zone, "fr") || byId(a.value.id, b.value.id),
  );
  const titled = sorted.map(({ path, value }) => ({
    path,
    value: {
      ...value,
      titre: value.resume,
      champs: { entree: Object.keys(value.entree), sortie: Object.keys(value.sortie) },
    },
  }));
  return candidate("endpoint", idOf)(titled);
}

/** Exigences indexées par catégorie (ordre du format) puis numéro (B772). */
function requirementCandidates(spec: ParsedSpec): Candidate[] {
  const rank = (nfr: Nfr) => NFR_CATEGORIES.indexOf(nfr.categorie);
  const sorted = [...spec.nfrs].sort(
    (a, b) => rank(a.value) - rank(b.value) || byId(a.value.id, b.value.id),
  );
  return candidate("nfr", idOf)(sorted);
}

/** Cahier technique : choix, opérations, exigences et le bloc des environnements. */
function technicalCandidates(spec: ParsedSpec): Candidate[] {
  const environments = spec.environments.map(({ path, value }) => ({
    path,
    value: { ...value, titre: ENVIRONMENTS_TITLE },
  }));
  return [
    ...stackCandidates(spec),
    ...operationCandidates(spec),
    ...requirementCandidates(spec),
    ...candidate("environments", () => "environments")(environments),
  ];
}

const SECURITY_TITLES = {
  rights: "Matrice des droits",
  asvs: "Exigences ASVS",
  security_summary: "Résumé client",
} as const;

/** Rang d'une surface : les fonctionnalités dans l'ordre numérique, puis « API » (B792). */
const surfaceRank = (surface: string | undefined): number =>
  Number(/^F-(\d+)$/.exec(surface ?? "")?.[1] ?? Number.MAX_SAFE_INTEGER);

/** Menaces triées par première surface puis identifiant (B808), titrées pour la recherche. */
function threatCandidates(spec: ParsedSpec): Candidate[] {
  const sorted = [...spec.threats].sort(
    (a, b) =>
      surfaceRank(a.value.surfaces[0]) - surfaceRank(b.value.surfaces[0]) ||
      byId(a.value.id, b.value.id),
  );
  return candidate("threat", idOf)(sorted);
}

/** Une ligne par entrée de `security/data.yaml`, désignée par son premier champ ; les transferts du fichier y sont repris. */
function entryCandidates(spec: ParsedSpec): Candidate[] {
  const entries = spec.securityData.flatMap(({ path, value: { donnees, transferts } }) =>
    donnees.map((entry) => ({
      path,
      value: { ...entry, titre: entry.donnee, transferts },
    })),
  );
  const first = (entry: { value: unknown }) => (entry.value as { champs: string[] }).champs[0];
  const sorted = entries.sort((a, b) => byId(first(a) ?? "", first(b) ?? ""));
  return candidate("sensitive", (entry) => first(entry) ?? "")(sorted);
}

/** Fichier unique de la Sécurité (droits, exigences, résumé) : une ligne titrée, d'identifiant fixe. */
function securityFile(
  kind: keyof typeof SECURITY_TITLES,
  specId: string,
  list: readonly { path: string; value: object }[],
): Candidate[] {
  const titled = list.map(({ path, value }) => ({
    path,
    value: { ...value, titre: SECURITY_TITLES[kind] },
  }));
  return candidate(kind, () => specId)(titled);
}

/** Livrable Sécurité (TK-117) : menaces, données classées, droits, exigences et résumé. */
const securityCandidates = (spec: ParsedSpec): Candidate[] => [
  ...threatCandidates(spec),
  ...entryCandidates(spec),
  ...securityFile("rights", "rights", spec.rights),
  ...securityFile("asvs", "asvs", spec.asvs),
  ...securityFile("security_summary", "summary", spec.securitySummaries),
];

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
    ...securityCandidates(spec),
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
