import { randomUUID } from "node:crypto";
import type { TestDatabase } from "../../src/testing/test-database.ts";
import {
  insertMember,
  type NotificationScope,
  notificationScope,
} from "./notifications-fixtures.ts";
import { insertUser } from "./oauth-fixtures.ts";

/** Table ajoutée par TK-55a : liaison d'un membre `client` à un projet (cloisonnement par projet). */
export const PROJECT_CLIENT_TABLES = ["project_client_access"] as const;
export const PROJECT_CLIENT_MODELS = ["ProjectClientAccess"] as const;

export const PROJECT_CLIENT_SUFFIX = "_project_client_access";
export const PROJECT_CLIENT_MIGRATION = "20261102090000_project_client_access";

/** Colonnes exactes (`udt_name/is_nullable`) : aucune JSON, aucun texte libre. */
export const PROJECT_CLIENT_COLUMNS = {
  created_at: "timestamptz/NO",
  created_by_user_id: "uuid/YES",
  id: "uuid/NO",
  organization_id: "uuid/NO",
  project_id: "uuid/NO",
  updated_at: "timestamptz/NO",
  user_id: "uuid/NO",
} as const;

/** Une organisation, un projet et un utilisateur membre (le « client » lié). */
export type ProjectClientScope = NotificationScope;

export const projectClientScope = (db: TestDatabase, label: string): Promise<ProjectClientScope> =>
  notificationScope(db, label);

/** Second projet de la même organisation. */
export async function secondProject(
  db: Pick<TestDatabase, "query">,
  scope: ProjectClientScope,
  label = "second",
): Promise<string> {
  const id = randomUUID();
  await db.query(
    "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, $3, now(), now())",
    [id, scope.organizationId, `project-${label}`],
  );
  return id;
}

/** Un second utilisateur membre de la même organisation. */
export async function secondClient(
  db: TestDatabase,
  scope: ProjectClientScope,
  label = "second-client",
): Promise<string> {
  const userId = await insertUser(db, label);
  await insertMember(db, scope.organizationId, userId);
  return userId;
}

export interface ProjectClientOverrides {
  id?: string;
  organizationId?: string;
  projectId?: string;
  userId?: string;
  createdByUserId?: string | null;
}

/** Insère un lien valide ; chaque colonne est fournie explicitement. */
export async function insertProjectClient(
  db: Pick<TestDatabase, "query">,
  scope: ProjectClientScope,
  o: ProjectClientOverrides = {},
): Promise<string> {
  const id = o.id ?? randomUUID();
  await db.query(
    `INSERT INTO project_client_access (id, organization_id, project_id, user_id, created_by_user_id,
       created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now(), now())`,
    [
      id,
      o.organizationId ?? scope.organizationId,
      o.projectId ?? scope.projectId,
      o.userId ?? scope.userId,
      o.createdByUserId === undefined ? null : o.createdByUserId,
    ],
  );
  return id;
}
