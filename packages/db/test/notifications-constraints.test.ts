import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  insertMember,
  insertNotification,
  NOTIFICATION_COLUMNS,
  NOTIFICATION_SUBJECT_KINDS,
  NOTIFICATION_TYPES,
  type NotificationOverrides,
  notificationScope,
  secondRecipient,
} from "./support/notifications-fixtures.ts";
import { insertUser } from "./support/oauth-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-51d : contraintes de `notifications` (in-app, sans charge utile libre : aucune colonne JSON ni
 * texte long). Destinataire = membre de l'organisation (FK composite), idempotence par
 * `UNIQUE (recipient_user_id, dedupe_key)`, `type` en texte contraint par CHECK (D7). Prouvées par SQL.
 */
const FOREIGN_KEY = "23503";
const UNIQUE = "23505";
const CHECK = "23514";
const NOT_NULL = "23502";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

/** SQLSTATE de l'insertion d'une notification dans un périmètre neuf ; `undefined` si elle réussit. */
const attempt = async (label: string, o: NotificationOverrides) =>
  sqlState(async () => insertNotification(db, await notificationScope(db, label), o));

const defs = async (type: "f" | "c") =>
  (
    await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'notifications'::regclass AND contype = '${type}' ORDER BY 1`,
    )
  ).map((r) => r.def);

const indexDefs = async () =>
  (
    await db.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'notifications'",
    )
  ).map((r) => r.indexdef);

const count = async (column: string, value: string) =>
  Number(
    (
      await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM notifications WHERE ${column} = $1`,
        [value],
      )
    )[0]?.n,
  );

describe("notifications : structure", () => {
  it("colonnes exactes : types et nullabilité", async () => {
    const rows = await db.query<{ column_name: string; udt_name: string; is_nullable: string }>(
      `SELECT column_name, udt_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'notifications' ORDER BY column_name`,
    );
    expect(
      Object.fromEntries(rows.map((r) => [r.column_name, `${r.udt_name}/${r.is_nullable}`])),
    ).toEqual(NOTIFICATION_COLUMNS);
  });

  it("aucune colonne JSON, tableau, binaire ou enum : rien de sensible ne peut y être stocké", async () => {
    const exotic = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'notifications'
         AND (udt_name IN ('json', 'jsonb', 'bytea', 'xml') OR udt_name LIKE '\\_%'
              OR data_type = 'USER-DEFINED')`,
    );
    expect(exotic).toEqual([]);
  });

  it("aucun défaut sur type, subject_*, dedupe_key, read_at ni project_id", async () => {
    const rows = await db.query<{ column_name: string; column_default: string | null }>(
      `SELECT column_name, column_default FROM information_schema.columns
       WHERE table_name = 'notifications'
         AND column_name IN ('type', 'subject_kind', 'subject_ref', 'dedupe_key', 'read_at', 'project_id')`,
    );
    expect(rows).toHaveLength(6);
    for (const row of rows) expect(row.column_default, row.column_name).toBeNull();
  });

  it("chaque colonne texte est bornée par un CHECK (aucun texte libre non borné)", async () => {
    const checks = (await defs("c")).join("\n");
    for (const column of ["type", "subject_kind", "subject_ref", "dedupe_key"]) {
      expect(checks, column).toMatch(new RegExp(`\\b${column}\\b`));
    }
    expect(checks).toMatch(/char_length\(subject_ref\)/);
    expect(checks).toMatch(/char_length\(dedupe_key\)/);
  });

  it("aucun trigger : une notification se marque lue par un simple UPDATE", async () => {
    const triggers = await db.query(
      "SELECT tgname FROM pg_trigger WHERE tgrelid = 'notifications'::regclass AND NOT tgisinternal",
    );
    expect(triggers).toEqual([]);
  });

  it("index : organization_id, unique (recipient_user_id, dedupe_key), non lues par destinataire", async () => {
    const found = await indexDefs();
    expect(found.some((d) => /^CREATE INDEX .*\(organization_id\)/.test(d))).toBe(true);
    expect(
      found.some((d) => /^CREATE UNIQUE INDEX .*\(recipient_user_id, dedupe_key\)/.test(d)),
    ).toBe(true);
    const unread = found.find((d) =>
      /^CREATE INDEX .*\(recipient_user_id, created_at DESC\) WHERE \(read_at IS NULL\)$/.test(d),
    );
    expect(unread, "index partiel des non lues").toBeDefined();
  });

  it("aucun UNIQUE hors clé primaire et (recipient_user_id, dedupe_key)", async () => {
    const unique = (await indexDefs()).filter((d) => d.startsWith("CREATE UNIQUE"));
    expect(unique).toHaveLength(2);
  });
});

describe("notifications : type et genre de sujet (listes fermées par CHECK)", () => {
  it("chaque type de la liste fermée est accepté", async () => {
    const scope = await notificationScope(db, "types-ok");
    for (const type of NOTIFICATION_TYPES) {
      expect(await sqlState(() => insertNotification(db, scope, { type })), type).toBeUndefined();
    }
  });

  it("un type hors liste est refusé (23514) : inconnu, majuscules, vide, préfixe ou espaces", async () => {
    for (const type of ["inconnu", "Suggestion.Created", "", "suggestion.created ", "suggestion"]) {
      expect(await attempt("type-bad", { type }), JSON.stringify(type)).toBe(CHECK);
    }
  });

  it("chaque genre de sujet de la liste fermée est accepté, les autres refusés (23514)", async () => {
    const scope = await notificationScope(db, "kinds");
    for (const subjectKind of NOTIFICATION_SUBJECT_KINDS) {
      expect(
        await sqlState(() => insertNotification(db, scope, { subjectKind })),
        subjectKind,
      ).toBeUndefined();
    }
    for (const subjectKind of ["project", "user", "", "Ticket"]) {
      expect(await attempt("kind-bad", { subjectKind }), subjectKind).toBe(CHECK);
    }
  });
});

describe("notifications : bornes de longueur", () => {
  it("subject_ref : 1 à 64 caractères (64 accepté, 65 et vide refusés)", async () => {
    expect(await attempt("ref-1", { subjectRef: "x" })).toBeUndefined();
    expect(await attempt("ref-64", { subjectRef: "x".repeat(64) })).toBeUndefined();
    expect(await attempt("ref-65", { subjectRef: "x".repeat(65) })).toBe(CHECK);
    expect(await attempt("ref-0", { subjectRef: "" })).toBe(CHECK);
  });

  it("dedupe_key : 1 à 120 caractères (120 accepté, 121 et vide refusés)", async () => {
    expect(await attempt("dedupe-1", { dedupeKey: "k" })).toBeUndefined();
    expect(await attempt("dedupe-120", { dedupeKey: "k".repeat(120) })).toBeUndefined();
    expect(await attempt("dedupe-121", { dedupeKey: "k".repeat(121) })).toBe(CHECK);
    expect(await attempt("dedupe-0", { dedupeKey: "" })).toBe(CHECK);
  });

  it("un contenu long ne peut se glisser dans aucune colonne texte", async () => {
    const long = "Bonjour, voici un long message libre. ".repeat(20);
    for (const override of [{ subjectRef: long }, { dedupeKey: long }, { type: long }]) {
      expect(await attempt("long", override), Object.keys(override)[0]).toBe(CHECK);
    }
  });
});

describe("notifications : colonnes obligatoires", () => {
  it("organization_id, recipient_user_id, type, subject_kind, subject_ref, dedupe_key : NOT NULL (23502)", async () => {
    const scope = await notificationScope(db, "not-null");
    for (const column of [
      "organization_id",
      "recipient_user_id",
      "type",
      "subject_kind",
      "subject_ref",
      "dedupe_key",
    ]) {
      const values: Record<string, string> = {
        organization_id: `'${scope.organizationId}'::uuid`,
        recipient_user_id: `'${scope.userId}'::uuid`,
        type: "'suggestion.created'",
        subject_kind: "'suggestion'",
        subject_ref: "'SG-1'",
        dedupe_key: "gen_random_uuid()::text",
        [column]: "NULL",
      };
      expect(
        await sqlState(() =>
          db.query(
            `INSERT INTO notifications (id, ${Object.keys(values).join(", ")}, created_at, updated_at)
             SELECT gen_random_uuid(), ${Object.values(values).join(", ")}, now(), now()`,
          ),
        ),
        column,
      ).toBe(NOT_NULL);
    }
  });

  it("project_id et read_at peuvent être NULL ; read_at NULL signifie non lue", async () => {
    const scope = await notificationScope(db, "nullable");
    const id = await insertNotification(db, scope, { projectId: null });
    const [row] = await db.query<{ project_id: string | null; read_at: string | null }>(
      "SELECT project_id, read_at FROM notifications WHERE id = $1",
      [id],
    );
    expect(row).toEqual({ project_id: null, read_at: null });
  });
});

describe("notifications : clés étrangères composites", () => {
  it("exactement deux FK : membre (organization_id, recipient_user_id) et projet, en cascade", async () => {
    expect(await defs("f")).toEqual(
      [
        "FOREIGN KEY (organization_id, recipient_user_id) REFERENCES members(organization_id, user_id) ON DELETE CASCADE",
        "FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id) ON DELETE CASCADE",
      ].sort(),
    );
  });

  it("un destinataire qui n'est pas membre de l'organisation est refusé (23503)", async () => {
    const scope = await notificationScope(db, "not-member");
    const outsider = await insertUser(db, "outsider");
    expect(await sqlState(() => insertNotification(db, scope, { recipientUserId: outsider }))).toBe(
      FOREIGN_KEY,
    );
    expect(
      await sqlState(() => insertNotification(db, scope, { recipientUserId: randomUUID() })),
    ).toBe(FOREIGN_KEY);
  });

  it("un membre d'une autre organisation est refusé (23503), y compris via une organisation inexistante", async () => {
    const a = await notificationScope(db, "member-a");
    const b = await notificationScope(db, "member-b");
    expect(await sqlState(() => insertNotification(db, a, { recipientUserId: b.userId }))).toBe(
      FOREIGN_KEY,
    );
    expect(await sqlState(() => insertNotification(db, a, { organizationId: randomUUID() }))).toBe(
      FOREIGN_KEY,
    );
  });

  it("un membre de deux organisations est destinataire dans chacune", async () => {
    const a = await notificationScope(db, "dual-a");
    const b = await notificationScope(db, "dual-b");
    await insertMember(db, b.organizationId, a.userId);
    expect(
      await sqlState(() =>
        insertNotification(db, b, { recipientUserId: a.userId, dedupeKey: "dual-b" }),
      ),
    ).toBeUndefined();
    expect(
      await sqlState(() => insertNotification(db, a, { dedupeKey: "dual-a" })),
    ).toBeUndefined();
  });
});

describe("notifications : clé étrangère vers le projet", () => {
  it("un projet d'une autre organisation ou inexistant est refusé (23503) ; sans projet accepté", async () => {
    const a = await notificationScope(db, "proj-a");
    const b = await notificationScope(db, "proj-b");
    expect(await sqlState(() => insertNotification(db, a, { projectId: b.projectId }))).toBe(
      FOREIGN_KEY,
    );
    expect(await sqlState(() => insertNotification(db, a, { projectId: randomUUID() }))).toBe(
      FOREIGN_KEY,
    );
    expect(await sqlState(() => insertNotification(db, a, { projectId: null }))).toBeUndefined();
  });
});

describe("notifications : idempotence (pg-boss livre au moins une fois)", () => {
  it("un second insert du même (destinataire, dedupe_key) est refusé (23505)", async () => {
    const scope = await notificationScope(db, "dedupe");
    await insertNotification(db, scope, { dedupeKey: "suggestion.created:abc" });
    expect(
      await sqlState(() => insertNotification(db, scope, { dedupeKey: "suggestion.created:abc" })),
    ).toBe(UNIQUE);
  });

  it("le rejeu avec ON CONFLICT DO NOTHING est un no-op : une seule ligne, la première gagne", async () => {
    const scope = await notificationScope(db, "replay");
    const first = await insertNotification(db, scope, { dedupeKey: "review.submitted:42" });
    const replay = await db.query(
      `INSERT INTO notifications (id, organization_id, recipient_user_id, project_id, type,
         subject_kind, subject_ref, dedupe_key, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'review.submitted', 'review', 'r-2', 'review.submitted:42',
         now(), now())
       ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING RETURNING id`,
      [scope.organizationId, scope.userId, scope.projectId],
    );
    expect(replay).toEqual([]);
    const rows = await db.query<{ id: string; subject_ref: string }>(
      "SELECT id, subject_ref FROM notifications WHERE recipient_user_id = $1",
      [scope.userId],
    );
    expect(rows).toEqual([{ id: first, subject_ref: "SG-1" }]);
  });

  it("la même clé pour deux destinataires coexiste ; deux clés pour un destinataire aussi", async () => {
    const scope = await notificationScope(db, "fanout");
    const other = await secondRecipient(db, scope);
    await insertNotification(db, scope, { dedupeKey: "k1" });
    await insertNotification(db, scope, { recipientUserId: other, dedupeKey: "k1" });
    await insertNotification(db, scope, { dedupeKey: "k2" });
    expect(await count("organization_id", scope.organizationId)).toBe(3);
  });
});

describe("notifications : lu / non lu", () => {
  it("marquer lue est un UPDATE de read_at ; les non lues se comptent par destinataire", async () => {
    const scope = await notificationScope(db, "read");
    const other = await secondRecipient(db, scope);
    const first = await insertNotification(db, scope);
    await insertNotification(db, scope);
    await insertNotification(db, scope, { recipientUserId: other });
    const unread = async (user: string) =>
      Number(
        (
          await db.query<{ n: string }>(
            "SELECT count(*)::text AS n FROM notifications WHERE recipient_user_id = $1 AND read_at IS NULL",
            [user],
          )
        )[0]?.n,
      );
    expect(await unread(scope.userId)).toBe(2);
    await db.query("UPDATE notifications SET read_at = now(), updated_at = now() WHERE id = $1", [
      first,
    ]);
    expect(await unread(scope.userId)).toBe(1);
    expect(await unread(other)).toBe(1);
  });

  it("l'index partiel sert la lecture des non lues (plan tolérant : index ou balayage séquentiel sur petite table)", async () => {
    const scope = await notificationScope(db, "plan");
    for (let i = 0; i < 3; i++) await insertNotification(db, scope);
    await db.query("SET enable_seqscan = off");
    try {
      const plan = (
        await db.query<{ "QUERY PLAN": string }>(
          `EXPLAIN SELECT id FROM notifications
           WHERE recipient_user_id = '${scope.userId}' AND read_at IS NULL
           ORDER BY created_at DESC LIMIT 20`,
        )
      )
        .map((r) => r["QUERY PLAN"])
        .join("\n");
      expect(plan).toMatch(/Index/);
    } finally {
      await db.query("RESET enable_seqscan");
    }
  });
});

describe("notifications : cascade à la suppression", () => {
  it("retirer le membre supprime ses notifications, pas celles des autres", async () => {
    const scope = await notificationScope(db, "cascade-member");
    const other = await secondRecipient(db, scope);
    await insertNotification(db, scope);
    await insertNotification(db, scope, { recipientUserId: other });
    await db.query("DELETE FROM members WHERE organization_id = $1 AND user_id = $2", [
      scope.organizationId,
      scope.userId,
    ]);
    expect(await count("recipient_user_id", scope.userId)).toBe(0);
    expect(await count("recipient_user_id", other)).toBe(1);
  });

  it("retirer un membre d'une organisation garde ses notifications d'une autre organisation", async () => {
    const a = await notificationScope(db, "cascade-dual-a");
    const b = await notificationScope(db, "cascade-dual-b");
    await insertMember(db, b.organizationId, a.userId);
    await insertNotification(db, a);
    await insertNotification(db, b, { recipientUserId: a.userId });
    await db.query("DELETE FROM members WHERE organization_id = $1 AND user_id = $2", [
      a.organizationId,
      a.userId,
    ]);
    expect(await count("organization_id", a.organizationId)).toBe(0);
    expect(await count("organization_id", b.organizationId)).toBe(1);
  });

  it("supprimer l'utilisateur supprime son appartenance puis ses notifications", async () => {
    const scope = await notificationScope(db, "cascade-user");
    await insertNotification(db, scope);
    await db.query("DELETE FROM users WHERE id = $1", [scope.userId]);
    expect(await count("recipient_user_id", scope.userId)).toBe(0);
  });

  it("supprimer le projet supprime les notifications du projet, pas celles sans projet", async () => {
    const scope = await notificationScope(db, "cascade-project");
    await insertNotification(db, scope);
    const detached = await insertNotification(db, scope, { projectId: null });
    await db.query("DELETE FROM projects WHERE id = $1", [scope.projectId]);
    expect(await count("project_id", scope.projectId)).toBe(0);
    expect(await count("id", detached)).toBe(1);
  });

  it("supprimer l'organisation supprime toutes ses notifications, sans erreur", async () => {
    const a = await notificationScope(db, "cascade-org-a");
    const b = await notificationScope(db, "cascade-org-b");
    await insertNotification(db, a);
    await insertNotification(db, a, { projectId: null });
    await insertNotification(db, b);
    await db.query("DELETE FROM organizations WHERE id = $1", [a.organizationId]);
    expect(await count("organization_id", a.organizationId)).toBe(0);
    expect(await count("organization_id", b.organizationId)).toBe(1);
  });
});
