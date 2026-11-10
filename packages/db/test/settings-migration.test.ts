import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import {
  expectedTables,
  listMigrationDirs,
  migrationsDir,
  runPrisma,
  runPrismaOrThrow,
  schemaPath,
} from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { notificationScope } from "./support/notifications-fixtures.ts";
import { secondClient, secondProject } from "./support/project-client-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-97 (lot A, cas 4, 5, 9) : migration `*_settings` = `invitation_projects` (projets proposés à une
 * invitation, liens créés à l'acceptation, B98) + `notification_preferences` (B101). Additive, sans
 * enum, fonction ni trigger ; `down.sql` retire les deux tables seules ; rejouable ; `migrate diff` vide.
 */
const SUFFIX = "_settings";
const TABLES = ["invitation_projects", "notification_preferences"] as const;
const FOREIGN_KEY = "23503";
const UNIQUE = "23505";
const CHECK = "23514";
/** Liste fermée de clés (B101) : miroir de `NOTIFICATION_PREFERENCE_KEYS` du contrat. */
const KEYS = [
  "client_validation",
  "pr_to_review",
  "agent_silent",
  "ai_budget",
  "weekly_digest",
  "deliverable_to_validate",
  "feature_ready",
  "comment_reply",
];

const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-97 migration settings : dossier et contenu", () => {
  it("existe, après 20261107150000_project_visits, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_settings").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_project_visits")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql crée deux tables sans enum, fonction, trigger ni colonne générée", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(2);
    for (const table of TABLES) expect(up).toContain(`CREATE TABLE "${table}"`);
    expect(up).not.toMatch(/CREATE\s+TYPE|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|CREATE\s+TRIGGER/i);
    expect(up).not.toMatch(/GENERATED|\bDROP\b|ALTER\s+TYPE|\bjsonb?\b/i);
  });

  it("down.sql retire seulement les deux tables", () => {
    const down = code(sqlOf("down.sql"));
    expect(down.match(/DROP\s+TABLE/gi)).toHaveLength(2);
    for (const table of TABLES) expect(down).toContain(`"${table}"`);
    expect(down).not.toMatch(/DROP\s+(?:TYPE|FUNCTION|TRIGGER)/i);
  });

  it("expectedTables contient les deux tables (56 au total avec TK-91)", () => {
    for (const table of TABLES) expect(expectedTables).toContain(table);
    expect(expectedTables).toHaveLength(57);
  });

  it("les modèles InvitationProject et NotificationPreference sont des modèles d'organisation", () => {
    expect(dbPackage.TENANT_MODELS).toContain("InvitationProject");
    expect(dbPackage.TENANT_MODELS).toContain("NotificationPreference");
  });
});

let db: TestDatabase;
let baseline: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  baseline = await createTestDatabase();
}, 600_000);

afterAll(async () => {
  await db?.dispose();
  await baseline?.dispose();
}, 60_000);

async function inventory(target: TestDatabase) {
  const rows = async (sql: string) =>
    (await target.query<{ name: string }>(sql)).map((r) => r.name);
  return {
    tables: await rows(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY 1`,
    ),
    columns: await rows(
      `SELECT table_name || '.' || column_name || ' ' || udt_name || ' null=' || is_nullable
              || ' default=' || coalesce(column_default, '-') AS name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY 1`,
    ),
    indexes: await rows(
      `SELECT indexname || ' ' || indexdef AS name FROM pg_indexes
       WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1`,
    ),
    constraints: await rows(
      `SELECT cl.relname || '.' || con.conname || ' ' || pg_get_constraintdef(con.oid) AS name
       FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       WHERE n.nspname = 'public' AND cl.relname <> '_prisma_migrations' ORDER BY 1`,
    ),
  };
}

async function insertInvitation(
  target: TestDatabase,
  scope: { organizationId: string; userId: string },
) {
  const id = randomUUID();
  await target.query(
    `INSERT INTO invitations (id, organization_id, email, role, status, expires_at, inviter_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'client', 'pending', now() + interval '7 days', $4, now(), now())`,
    [id, scope.organizationId, `inv-${id.slice(0, 8)}@example.test`, scope.userId],
  );
  return id;
}

const insertLink = (
  target: Pick<TestDatabase, "query">,
  o: { invitationId: string; organizationId: string; projectId: string },
) =>
  target.query(
    `INSERT INTO invitation_projects (id, invitation_id, organization_id, project_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())`,
    [randomUUID(), o.invitationId, o.organizationId, o.projectId],
  );

const insertPreference = (
  target: Pick<TestDatabase, "query">,
  o: { organizationId: string; userId: string },
  key: string,
  enabled = true,
) =>
  target.query(
    `INSERT INTO notification_preferences (id, organization_id, user_id, key, enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now(), now())`,
    [randomUUID(), o.organizationId, o.userId, key, enabled],
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: cycle up, down, up d'une même migration, un test par étape
describe("TK-97 migration settings : up, down, up", () => {
  let afterFirstUp: Awaited<ReturnType<typeof inventory>>;

  it("deploy crée les deux tables avec leurs colonnes et leurs unicités", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    const names = (table: string) =>
      afterFirstUp.columns
        .filter((c) => c.startsWith(`${table}.`))
        .map((c) => c.split(" ")[0])
        .sort();
    expect(names("invitation_projects")).toEqual(
      ["created_at", "id", "invitation_id", "organization_id", "project_id", "updated_at"].map(
        (c) => `invitation_projects.${c}`,
      ),
    );
    expect(names("notification_preferences")).toEqual(
      ["created_at", "enabled", "id", "key", "organization_id", "updated_at", "user_id"].map(
        (c) => `notification_preferences.${c}`,
      ),
    );
    const idx = afterFirstUp.indexes.join("\n");
    expect(idx).toMatch(
      /UNIQUE INDEX.*ON public\.invitation_projects.*\(invitation_id, project_id\)/,
    );
    expect(idx).toMatch(
      /UNIQUE INDEX.*ON public\.notification_preferences.*\(user_id, organization_id, key\)/,
    );
  }, 600_000);

  it("down.sql ramène exactement à l'état précédent ; les membres et invitations survivent", async () => {
    for (const dir of dirs().filter((d) => d < migration())) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await inventory(baseline);
    const scope = await notificationScope(db, "settings-cycle");
    const invitationId = await insertInvitation(db, scope);
    await insertLink(db, { ...scope, invitationId });
    await insertPreference(db, scope, "weekly_digest", true);

    // Les migrations postérieures (espace Idée, TK-89) sont défaites d'abord, de la plus récente à la plus ancienne.
    for (const dir of dirs()
      .filter((d) => d >= migration())
      .reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }

    expect(await inventory(db)).toEqual(expected);
    expect(await db.query("SELECT 1 FROM invitations WHERE id = $1", [invitationId])).toHaveLength(
      1,
    );
    expect(await db.query("SELECT 1 FROM members WHERE user_id = $1", [scope.userId])).toHaveLength(
      1,
    );
  }, 600_000);

  it("second deploy : même inventaire, tables vides", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await inventory(db)).toEqual(afterFirstUp);
    for (const table of TABLES) {
      const [count] = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
      expect(count?.n).toBe("0");
    }
  }, 600_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 600_000);

  it("schema.prisma déclare les deux modèles sans champ Json", () => {
    const schema = readFileSync(schemaPath, "utf8");
    for (const [model, table] of [
      ["InvitationProject", "invitation_projects"],
      ["NotificationPreference", "notification_preferences"],
    ]) {
      const block = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`));
      expect(block?.[0], model).toMatch(new RegExp(`@@map\\("${table}"\\)`));
      expect(block?.[1]).not.toMatch(/\bJson\b/);
    }
  });
});

describe("TK-97 invitation_projects : contraintes", () => {
  it("un projet une seule fois par invitation ; un autre projet est accepté", async () => {
    const scope = await notificationScope(db, "ip-unique");
    const invitationId = await insertInvitation(db, scope);
    await insertLink(db, { ...scope, invitationId });
    expect(await sqlState(() => insertLink(db, { ...scope, invitationId }))).toBe(UNIQUE);
    await insertLink(db, {
      ...scope,
      invitationId,
      projectId: await secondProject(db, scope, "ip-2"),
    });
  });

  it("un projet d'une autre organisation est refusé (clé composite)", async () => {
    const a = await notificationScope(db, "ip-fk-a");
    const b = await notificationScope(db, "ip-fk-b");
    const invitationId = await insertInvitation(db, a);
    expect(
      await sqlState(() => insertLink(db, { ...a, invitationId, projectId: b.projectId })),
    ).toBe(FOREIGN_KEY);
  });

  it("supprimer l'invitation ou le projet supprime le lien (cascade)", async () => {
    const scope = await notificationScope(db, "ip-cascade");
    const invitationId = await insertInvitation(db, scope);
    await insertLink(db, { ...scope, invitationId });
    await db.query("DELETE FROM invitations WHERE id = $1", [invitationId]);
    expect(
      await db.query("SELECT 1 FROM invitation_projects WHERE invitation_id = $1", [invitationId]),
    ).toHaveLength(0);
    const second = await insertInvitation(db, scope);
    await insertLink(db, { ...scope, invitationId: second });
    await db.query("DELETE FROM projects WHERE id = $1", [scope.projectId]);
    expect(
      await db.query("SELECT 1 FROM invitation_projects WHERE invitation_id = $1", [second]),
    ).toHaveLength(0);
  });
});

describe("TK-97 notification_preferences : contraintes", () => {
  it("accepte chacune des huit clés fermées, une seule ligne par (utilisateur, organisation, clé)", async () => {
    const scope = await notificationScope(db, "np-keys");
    for (const key of KEYS) await insertPreference(db, scope, key, false);
    expect(await sqlState(() => insertPreference(db, scope, KEYS[0] as string))).toBe(UNIQUE);
  });

  it("refuse une clé inconnue (CHECK)", async () => {
    const scope = await notificationScope(db, "np-check");
    expect(await sqlState(() => insertPreference(db, scope, "inconnue"))).toBe(CHECK);
  });

  it("refuse un non-membre ou une autre organisation (clé composite) ; retirer le membre supprime ses préférences", async () => {
    const a = await notificationScope(db, "np-fk-a");
    const b = await notificationScope(db, "np-fk-b");
    expect(
      await sqlState(() => insertPreference(db, { ...a, userId: b.userId }, KEYS[0] as string)),
    ).toBe(FOREIGN_KEY);
    const other = await secondClient(db, a, "np-other");
    await insertPreference(db, { ...a, userId: other }, "comment_reply");
    await db.query("DELETE FROM members WHERE user_id = $1 AND organization_id = $2", [
      other,
      a.organizationId,
    ]);
    expect(
      await db.query("SELECT 1 FROM notification_preferences WHERE user_id = $1", [other]),
    ).toHaveLength(0);
  });
});
