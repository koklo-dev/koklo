import type { z } from "zod";
import {
  AdrSchema,
  ArchFlowSchema,
  BusinessRuleSchema,
  ComponentSchema,
  EndpointSchema,
  EnvironmentsFileSchema,
  FixtureSchema,
  FlowSchema,
  isRestEndpoint,
  NfrSchema,
  OPERATION_NAME,
  OperationSchema,
  ProjectManifestSchema,
  RelationsFileSchema,
  RolesFileSchema,
  ScreenSchema,
  StackSchema,
  TableSchema,
  TableV2Schema,
  TestScenarioSchema,
} from "../entities/index.ts";

export type Kind =
  | "project"
  | "feature"
  | "table"
  | "relations"
  | "endpoint"
  | "screen"
  | "test"
  | "roles"
  | "rule"
  | "flow"
  | "fixture"
  | "component"
  | "archflow"
  | "adr"
  | "stack"
  | "nfr"
  | "environments";

const SLUG = "[a-z0-9][a-z0-9-]*";
/** Table : `<slug>.yaml` (v2) ou `T-<slug>.yaml` (v1, toujours lu). */
const TABLE_FILE = new RegExp(`^data/tables/(T-[^/]+|${SLUG})\\.yaml$`);
/** Endpoint : `E-<slug>.yaml` (v1) ou `<zone>.<verbe>.yaml` (v2 REST et opération du cahier technique). */
const ENDPOINT_FILE = new RegExp(`^api/endpoints/(E-[^/]*|${OPERATION_NAME})\\.yaml$`);

/** Motif de chemin de chaque genre ; aucun chemin n'en vérifie deux. */
const KIND_FILES: readonly (readonly [RegExp, Kind])[] = [
  [/^koklo\.project\.yaml$/, "project"],
  [/^data\/relations\.yaml$/, "relations"],
  [/^domain\/roles\.yaml$/, "roles"],
  [/^features\/F-[^/]*\.md$/, "feature"],
  [TABLE_FILE, "table"],
  [ENDPOINT_FILE, "endpoint"],
  [/^design\/screens\/S-[^/]*\.json$/, "screen"],
  [/^domain\/rules\/R-[^/]*\.md$/, "rule"],
  [/^design\/flows\/P-[^/]*\.yaml$/, "flow"],
  [/^architecture\/components\/[^/]*\.yaml$/, "component"],
  [/^architecture\/flows\/P-[^/]*\.yaml$/, "archflow"],
  [/^architecture\/adr\/ADR-[^/]*\.md$/, "adr"],
  [/^data\/fixtures\/FX-[^/]*\.yaml$/, "fixture"],
  [/^(tests|quality)\/scenarios\/[^/]*\.yaml$/, "test"],
  [/^tech\/stack\/[^/]*\.yaml$/, "stack"],
  [/^nfr\/NFR-[^/]*\.yaml$/, "nfr"],
  [/^tech\/environments\.yaml$/, "environments"],
];

/** Type de fichier d'après son chemin ; `undefined` : hors modèle, ignoré. */
export const kindOf = (path: string): Kind | undefined =>
  KIND_FILES.find(([pattern]) => pattern.test(path))?.[1];

/**
 * Parcours `design/flows/P-*` : le `.yaml` est une entité du modèle (`kindOf`, TK-103) ; le `.json` hérité (B325 g) n'est
 * que lu par le worker, sans schéma, jamais validé ni réécrit.
 */
export const isFlowPath = (path: string): boolean =>
  /^design\/flows\/P-[^/]*\.(yaml|json)$/.test(path);

/** Fichier du dossier des tables : celui que `kindOf` ne reconnaît pas est signalé (hors `.gitkeep`). */
export const isTableDirPath = (path: string): boolean =>
  path.startsWith("data/tables/") && path.split("/").pop() !== ".gitkeep";

export const SCHEMAS = {
  project: ProjectManifestSchema,
  table: TableSchema,
  relations: RelationsFileSchema,
  endpoint: EndpointSchema,
  screen: ScreenSchema,
  test: TestScenarioSchema,
  roles: RolesFileSchema,
  rule: BusinessRuleSchema,
  flow: FlowSchema,
  fixture: FixtureSchema,
  component: ComponentSchema,
  archflow: ArchFlowSchema,
  adr: AdrSchema,
  stack: StackSchema,
  nfr: NfrSchema,
  environments: EnvironmentsFileSchema,
} as const satisfies Record<string, z.ZodType>;

/**
 * Schéma d'un type de fichier : la table change de forme avec la version de spec ; un endpoint sans `methode` est une
 * opération du cahier technique, le format REST restant lu (B720).
 */
export function schemaFor(kind: Kind, version: SpecVersion, data: unknown): z.ZodType {
  if (kind === "table" && version === 2) return TableV2Schema;
  if (kind === "endpoint" && !isRestEndpoint(data)) return OperationSchema;
  return SCHEMAS[kind as keyof typeof SCHEMAS];
}

export type SpecVersion = 1 | 2;

/** Clé donnant l'identifiant d'une entité dans la donnée brute. */
export function idKey(kind: Kind): string {
  return kind === "test" ? "feature" : "id";
}

/** Préfixes dont le fichier peut ne porter que le slug (`T-x` -> `x.yaml`). */
const SLUG_NAMED = ["T-", "C-", "ST-"];

/** Le nom de fichier doit être l'identifiant (ou commencer par `<id>-`) ; pour une table, un composant ou un choix technique, le slug suffit. */
export function idMatchesFile(path: string, id: string): boolean {
  const base = (path.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
  const slugOnly = SLUG_NAMED.some((p) => id.startsWith(p) && base === id.slice(p.length));
  return base === id || base.startsWith(`${id}-`) || slugOnly;
}
