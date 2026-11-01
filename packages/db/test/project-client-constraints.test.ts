import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { insertUser } from "./support/oauth-fixtures.ts";
import {
  insertProjectClient,
  PROJECT_CLIENT_COLUMNS,
  projectClientScope,
  secondClient,
  secondProject,
} from "./support/project-client-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-55a : contraintes de `project_client_access` (liaison client <-> projet). Toutes les clés
 * étrangères sont composites : une liaison ne traverse jamais une organisation. Que le membre ait
 * le rôle `client` est un invariant d'API : la base ne voit pas `members.role` autrement que par
 * du texte libre. Prouvé par SQL.
 */
const FOREIGN_KEY = "23503";
const UNIQUE = "23505";
const NOT_NULL = "23502";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

const defs = async (type: "f" | "c" | "u") =>
  (
    await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'project_client_access'::regclass AND contype = '${type}' ORDER BY 1`,
    )
  ).map((r) => r.def);

const indexDefs = async () =>
  (
    await db.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'project_client_access'",
    )
  ).map((r) => r.indexdef);

const countWhere = async (column: string, value: string) =>
  Number(
    (
      await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM project_client_access WHERE ${column} = $1`,
        [value],
      )
    )[0]?.n,
  );

describe("project_client_access : structure", () => {
  it("colonnes exactes : types et nullabilité", async () => {
    const rows = await db.query<{ column_name: string; udt_name: string; is_nullable: string }>(
      `SELECT column_name, udt_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'project_client_access' ORDER BY column_name`,
    );
    expect(
      Object.fromEntries(rows.map((r) => [r.column_name, `${r.udt_name}/${r.is_nullable}`])),
    ).toEqual(PROJECT_CLIENT_COLUMNS);
  });

  it("aucune colonne JSON, tableau, binaire, enum ni texte : rien de libre ne peut y être stocké", async () => {
    const exotic = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'project_client_access'
         AND (udt_name IN ('json', 'jsonb', 'bytea', 'xml', 'text', 'varchar')
              OR udt_name LIKE '\\_%' OR data_type = 'USER-DEFINED')`,
    );
    expect(exotic).toEqual([]);
  });

  it("aucun trigger et aucun CHECK : le rôle du membre est un invariant d'API", async () => {
    const triggers = await db.query(
      "SELECT tgname FROM pg_trigger WHERE tgrelid = 'project_client_access'::regclass AND NOT tgisinternal",
    );
    expect(triggers).toEqual([]);
    expect(await defs("c")).toEqual([]);
  });

  it("index : organization_id, (organization_id, user_id), unique (project_id, user_id) et (organization_id, id)", async () => {
    const found = await indexDefs();
    expect(found.some((d) => /^CREATE INDEX .*\(organization_id\)$/.test(d))).toBe(true);
    expect(found.some((d) => /^CREATE INDEX .*\(organization_id, user_id\)$/.test(d))).toBe(true);
    expect(found.some((d) => /^CREATE UNIQUE INDEX .*\(project_id, user_id\)$/.test(d))).toBe(true);
    expect(found.some((d) => /^CREATE UNIQUE INDEX .*\(organization_id, id\)$/.test(d))).toBe(true);
  });

  it("aucun UNIQUE hors clé primaire, (project_id, user_id) et (organization_id, id)", async () => {
    const unique = (await indexDefs()).filter((d) => d.startsWith("CREATE UNIQUE"));
    expect(unique).toHaveLength(3);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("project_client_access : clés étrangères composites", () => {
  it("exactement deux FK : projet et membre, en cascade", async () => {
    expect(await defs("f")).toEqual(
      [
        "FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id) ON DELETE CASCADE",
        "FOREIGN KEY (organization_id, user_id) REFERENCES members(organization_id, user_id) ON DELETE CASCADE",
      ].sort(),
    );
  });

  it("créateur sans clé étrangère : un utilisateur supprimé ne détruit pas la trace", async () => {
    const scope = await projectClientScope(db, "creator");
    expect(
      await sqlState(() => insertProjectClient(db, scope, { createdByUserId: randomUUID() })),
    ).toBeUndefined();
  });

  it("un lien nominal est accepté ; created_by_user_id peut être NULL", async () => {
    const scope = await projectClientScope(db, "ok");
    const id = await insertProjectClient(db, scope);
    const [row] = await db.query<{ created_by_user_id: string | null }>(
      "SELECT created_by_user_id FROM project_client_access WHERE id = $1",
      [id],
    );
    expect(row?.created_by_user_id).toBeNull();
  });

  it("un utilisateur qui n'est pas membre de l'organisation est refusé (23503)", async () => {
    const scope = await projectClientScope(db, "not-member");
    const outsider = await insertUser(db, "outsider");
    expect(await sqlState(() => insertProjectClient(db, scope, { userId: outsider }))).toBe(
      FOREIGN_KEY,
    );
    expect(await sqlState(() => insertProjectClient(db, scope, { userId: randomUUID() }))).toBe(
      FOREIGN_KEY,
    );
  });

  it("un membre d'une autre organisation est refusé (23503)", async () => {
    const a = await projectClientScope(db, "member-a");
    const b = await projectClientScope(db, "member-b");
    expect(await sqlState(() => insertProjectClient(db, a, { userId: b.userId }))).toBe(
      FOREIGN_KEY,
    );
  });

  it("un projet d'une autre organisation, inexistant, ou une organisation inexistante : refusé (23503)", async () => {
    const a = await projectClientScope(db, "proj-a");
    const b = await projectClientScope(db, "proj-b");
    expect(await sqlState(() => insertProjectClient(db, a, { projectId: b.projectId }))).toBe(
      FOREIGN_KEY,
    );
    expect(await sqlState(() => insertProjectClient(db, a, { projectId: randomUUID() }))).toBe(
      FOREIGN_KEY,
    );
    expect(await sqlState(() => insertProjectClient(db, a, { organizationId: randomUUID() }))).toBe(
      FOREIGN_KEY,
    );
  });

  it("le rôle n'est pas vérifié par la base : un membre non client peut être lié (invariant d'API)", async () => {
    const scope = await projectClientScope(db, "role-agnostic");
    await db.query("UPDATE members SET role = 'dev' WHERE organization_id = $1 AND user_id = $2", [
      scope.organizationId,
      scope.userId,
    ]);
    expect(await sqlState(() => insertProjectClient(db, scope))).toBeUndefined();
  });
});

describe("project_client_access : unicité", () => {
  it("le même client ne peut être lié deux fois au même projet (23505)", async () => {
    const scope = await projectClientScope(db, "dup");
    await insertProjectClient(db, scope);
    expect(await sqlState(() => insertProjectClient(db, scope))).toBe(UNIQUE);
  });

  it("le rejeu avec ON CONFLICT DO NOTHING est un no-op : une seule ligne", async () => {
    const scope = await projectClientScope(db, "replay");
    await insertProjectClient(db, scope);
    const replay = await db.query(
      `INSERT INTO project_client_access (id, organization_id, project_id, user_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, now(), now())
       ON CONFLICT (project_id, user_id) DO NOTHING RETURNING id`,
      [scope.organizationId, scope.projectId, scope.userId],
    );
    expect(replay).toEqual([]);
    expect(await countWhere("project_id", scope.projectId)).toBe(1);
  });

  it("un client peut être lié à plusieurs projets, un projet à plusieurs clients", async () => {
    const scope = await projectClientScope(db, "many");
    const other = await secondProject(db, scope);
    const second = await secondClient(db, scope);
    await insertProjectClient(db, scope);
    expect(
      await sqlState(() => insertProjectClient(db, scope, { projectId: other })),
    ).toBeUndefined();
    expect(
      await sqlState(() => insertProjectClient(db, scope, { userId: second })),
    ).toBeUndefined();
    expect(await countWhere("organization_id", scope.organizationId)).toBe(3);
  });

  it("l'identifiant est unique", async () => {
    const scope = await projectClientScope(db, "id");
    const second = await secondClient(db, scope);
    const id = await insertProjectClient(db, scope);
    expect(await sqlState(() => insertProjectClient(db, scope, { id, userId: second }))).toBe(
      UNIQUE,
    );
  });
});

describe("project_client_access : colonnes obligatoires", () => {
  it("organization_id, project_id, user_id : NOT NULL (23502)", async () => {
    const scope = await projectClientScope(db, "not-null");
    for (const column of ["organization_id", "project_id", "user_id"]) {
      const values: Record<string, string> = {
        organization_id: `'${scope.organizationId}'::uuid`,
        project_id: `'${scope.projectId}'::uuid`,
        user_id: `'${scope.userId}'::uuid`,
        [column]: "NULL",
      };
      expect(
        await sqlState(() =>
          db.query(
            `INSERT INTO project_client_access (id, ${Object.keys(values).join(", ")}, created_at, updated_at)
             SELECT gen_random_uuid(), ${Object.values(values).join(", ")}, now(), now()`,
          ),
        ),
        column,
      ).toBe(NOT_NULL);
    }
  });
});

describe("project_client_access : cascade à la suppression", () => {
  it("supprimer le projet supprime ses liens, pas ceux des autres projets", async () => {
    const scope = await projectClientScope(db, "cascade-project");
    const other = await secondProject(db, scope);
    await insertProjectClient(db, scope);
    await insertProjectClient(db, scope, { projectId: other });
    await db.query("DELETE FROM projects WHERE id = $1", [scope.projectId]);
    expect(await countWhere("project_id", scope.projectId)).toBe(0);
    expect(await countWhere("project_id", other)).toBe(1);
  });

  it("retirer le membre supprime ses liens, pas ceux des autres membres", async () => {
    const scope = await projectClientScope(db, "cascade-member");
    const second = await secondClient(db, scope);
    await insertProjectClient(db, scope);
    await insertProjectClient(db, scope, { userId: second });
    await db.query("DELETE FROM members WHERE organization_id = $1 AND user_id = $2", [
      scope.organizationId,
      scope.userId,
    ]);
    expect(await countWhere("user_id", scope.userId)).toBe(0);
    expect(await countWhere("user_id", second)).toBe(1);
  });

  it("retirer un membre d'une organisation garde ses liens d'une autre organisation", async () => {
    const a = await projectClientScope(db, "cascade-dual-a");
    const b = await projectClientScope(db, "cascade-dual-b");
    await db.query(
      `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'client', now(), now())`,
      [b.organizationId, a.userId],
    );
    await insertProjectClient(db, a);
    await insertProjectClient(db, b, { userId: a.userId });
    await db.query("DELETE FROM members WHERE organization_id = $1 AND user_id = $2", [
      a.organizationId,
      a.userId,
    ]);
    expect(await countWhere("organization_id", a.organizationId)).toBe(0);
    expect(await countWhere("organization_id", b.organizationId)).toBe(1);
  });

  it("supprimer l'organisation ou l'utilisateur supprime les liens", async () => {
    const orgScope = await projectClientScope(db, "cascade-org");
    await insertProjectClient(db, orgScope);
    await db.query("DELETE FROM organizations WHERE id = $1", [orgScope.organizationId]);
    expect(await countWhere("organization_id", orgScope.organizationId)).toBe(0);

    const userScope = await projectClientScope(db, "cascade-user");
    await insertProjectClient(db, userScope);
    await db.query("DELETE FROM users WHERE id = $1", [userScope.userId]);
    expect(await countWhere("user_id", userScope.userId)).toBe(0);
  });
});
