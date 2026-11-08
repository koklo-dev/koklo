import { randomUUID } from "node:crypto";
import type { TestDatabase } from "../../src/testing/test-database.ts";
import type { Scope } from "./ticket-fixtures.ts";

/** Tables et modèles ajoutés par TK-89 (espace Idée). */
export const IDEA_TABLES = [
  "idea_pages",
  "idea_publications",
  "idea_page_contributors",
  "idea_presence",
] as const;
export const IDEA_MODELS = [
  "IdeaPage",
  "IdeaPublication",
  "IdeaPageContributor",
  "IdeaPresence",
] as const;
/** Types créés par la migration (absents des bases de référence des migrations antérieures). */
export const IDEA_ENUMS = ["idea_page_status", "idea_page_origin"] as const;
/** Inventaire d'enums (`nom:valeurs` ou `nom`) sans ceux de l'espace Idée. */
export const withoutIdeaEnums = (enums: readonly string[]): string[] =>
  enums.filter(
    (entry) => !IDEA_ENUMS.some((name) => entry === name || entry.startsWith(`${name}:`)),
  );
export const IDEA_SUFFIX = "_idea";

/** Gabarit « cadrage par défaut » tel que la migration l'écrit (titre, slug, requise), positions 0 à 9. */
export const IDEA_TEMPLATE_SQL = [
  ["vision", "Vision", true],
  ["probleme", "Problème", true],
  ["utilisateurs", "Utilisateurs", true],
  ["proposition-valeur", "Proposition de valeur", false],
  ["parcours", "Parcours", false],
  ["perimetre", "Périmètre", true],
  ["contraintes", "Contraintes", false],
  ["mesure", "Mesure", false],
  ["hypotheses-risques", "Hypothèses et risques", false],
  ["glossaire", "Glossaire", false],
] as const;

export interface IdeaPageOverrides {
  id?: string;
  slug?: string;
  title?: string;
  position?: number;
  required?: boolean;
  origin?: string;
  status?: string;
  contentMd?: string;
  version?: number;
  deletedAt?: string | null;
}

/** Insère une page en SQL direct (bornes testées sans passer par l'API). */
export async function insertIdeaPage(
  db: TestDatabase,
  scope: Pick<Scope, "organizationId" | "projectId">,
  over: IdeaPageOverrides = {},
): Promise<string> {
  const id = over.id ?? randomUUID();
  await db.query(
    `INSERT INTO idea_pages (id, organization_id, project_id, slug, title, position, required, origin,
                             status, content_md, version, deleted_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::idea_page_origin, $9::idea_page_status, $10, $11, $12, now())`,
    [
      id,
      scope.organizationId,
      scope.projectId,
      over.slug ?? `page-${id.slice(0, 8)}`,
      over.title ?? "Page",
      over.position ?? 0,
      over.required ?? false,
      over.origin ?? "user",
      over.status ?? "empty",
      over.contentMd ?? "",
      over.version ?? 1,
      over.deletedAt ?? null,
    ],
  );
  return id;
}
