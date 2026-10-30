import type { z } from "zod";
import {
  EndpointSchema,
  ProjectManifestSchema,
  RelationsFileSchema,
  ScreenSchema,
  TableSchema,
  TestScenarioSchema,
} from "../entities/index.ts";

export type Kind = "project" | "feature" | "table" | "relations" | "endpoint" | "screen" | "test";

/** Type de fichier d'après son chemin ; `undefined` : hors modèle, ignoré. */
export function kindOf(path: string): Kind | undefined {
  if (path === "koklo.project.yaml") return "project";
  if (path === "data/relations.yaml") return "relations";
  if (/^features\/F-[^/]*\.md$/.test(path)) return "feature";
  if (/^data\/tables\/T-[^/]*\.yaml$/.test(path)) return "table";
  if (/^api\/endpoints\/E-[^/]*\.yaml$/.test(path)) return "endpoint";
  if (/^design\/screens\/S-[^/]*\.json$/.test(path)) return "screen";
  if (/^tests\/scenarios\/[^/]*\.yaml$/.test(path)) return "test";
  return undefined;
}

export const SCHEMAS = {
  project: ProjectManifestSchema,
  table: TableSchema,
  relations: RelationsFileSchema,
  endpoint: EndpointSchema,
  screen: ScreenSchema,
  test: TestScenarioSchema,
} as const satisfies Record<string, z.ZodType>;

/** Clé donnant l'identifiant d'une entité dans la donnée brute. */
export function idKey(kind: Kind): string {
  return kind === "test" ? "feature" : "id";
}

/** Le nom de fichier doit être l'identifiant (ou commencer par `<id>-`). */
export function idMatchesFile(path: string, id: string): boolean {
  const base = (path.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
  return base === id || base.startsWith(`${id}-`);
}
