import type { z } from "zod";
import {
  BusinessRuleSchema,
  EndpointSchema,
  FlowSchema,
  ProjectManifestSchema,
  RelationsFileSchema,
  RolesFileSchema,
  ScreenSchema,
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
  | "flow";

const SLUG = "[a-z0-9][a-z0-9-]*";
/** Table : `<slug>.yaml` (v2) ou `T-<slug>.yaml` (v1, toujours lu). */
const TABLE_FILE = new RegExp(`^data/tables/(T-[^/]+|${SLUG})\\.yaml$`);
/** Endpoint : `E-<slug>.yaml` (v1) ou `<zone>.<verbe>.yaml` (v2). */
const ENDPOINT_FILE = new RegExp(`^api/endpoints/(E-[^/]*|${SLUG}\\.${SLUG})\\.yaml$`);

/** Type de fichier d'après son chemin ; `undefined` : hors modèle, ignoré. */
export function kindOf(path: string): Kind | undefined {
  if (path === "koklo.project.yaml") return "project";
  if (path === "data/relations.yaml") return "relations";
  if (path === "domain/roles.yaml") return "roles";
  if (/^features\/F-[^/]*\.md$/.test(path)) return "feature";
  if (TABLE_FILE.test(path)) return "table";
  if (ENDPOINT_FILE.test(path)) return "endpoint";
  if (/^design\/screens\/S-[^/]*\.json$/.test(path)) return "screen";
  if (/^domain\/rules\/R-[^/]*\.md$/.test(path)) return "rule";
  if (/^design\/flows\/P-[^/]*\.yaml$/.test(path)) return "flow";
  if (/^(tests|quality)\/scenarios\/[^/]*\.yaml$/.test(path)) return "test";
  return undefined;
}

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
} as const satisfies Record<string, z.ZodType>;

/** Schéma d'un type de fichier selon la version de spec (seule la table change de forme). */
export const schemaFor = (kind: Kind, version: SpecVersion): z.ZodType =>
  kind === "table" && version === 2 ? TableV2Schema : SCHEMAS[kind as keyof typeof SCHEMAS];

export type SpecVersion = 1 | 2;

/** Clé donnant l'identifiant d'une entité dans la donnée brute. */
export function idKey(kind: Kind): string {
  return kind === "test" ? "feature" : "id";
}

/** Le nom de fichier doit être l'identifiant (ou commencer par `<id>-`) ; pour une table, le slug suffit (`T-x` -> `x.yaml`). */
export function idMatchesFile(path: string, id: string): boolean {
  const base = (path.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
  return base === id || base.startsWith(`${id}-`) || (id.startsWith("T-") && base === id.slice(2));
}
