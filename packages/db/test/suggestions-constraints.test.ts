import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { allowedValues } from "./support/spec-fixtures.ts";
import {
  insertSuggestion,
  SHA40,
  SHA64,
  SUGGESTION_COLUMNS,
  SUGGESTION_STATUSES,
  SUGGESTION_TABLE,
  SUGGESTION_TARGET_KINDS,
  type SuggestionOverrides,
  suggestionScope,
} from "./support/suggestions-fixtures.ts";
import { insertScope, openPool, type Scope, sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-51b : contraintes de `suggestions`, prouvées par SQL direct. Clé `SG-n` unique par projet,
 * allouée par le compteur transactionnel `suggestion` ; cible = genre + référence de spec sans FK ;
 * auteur et décideur sans FK (RGPD) ; statuts open/accepted/rejected/withdrawn avec CHECK de
 * cohérence sur la décision ; textes bornés ; FK composites (organization_id, project_id).
 */
const FOREIGN_KEY = "23503";
const UNIQUE = "23505";
const CHECK = "23514";
const NOT_NULL = "23502";
const INVALID_ENUM = "22P02";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

/** SQLSTATE de l'erreur d'une insertion dans un projet neuf ; `undefined` si elle réussit. */
const attempt = async (label: string, overrides: SuggestionOverrides) => {
  const scope = await suggestionScope(db, label);
  return sqlState(() => insertSuggestion(db, scope, { key: "SG-1", ...overrides }));
};
const DECIDED = "2026-11-02T10:00:00Z";

describe("suggestions : structure", () => {
  it("colonnes exactes : types et nullabilité", async () => {
    const rows = await db.query<{ column_name: string; udt_name: string; is_nullable: string }>(
      `SELECT column_name, udt_name, is_nullable FROM information_schema.columns
       WHERE table_name = '${SUGGESTION_TABLE}' ORDER BY column_name`,
    );
    const columns = Object.fromEntries(
      rows.map((r) => [r.column_name, `${r.udt_name}/${r.is_nullable}`]),
    );
    expect(columns).toEqual(SUGGESTION_COLUMNS);
  });

  it("status vaut 'open' par défaut ; target_kind n'a pas de défaut", async () => {
    const rows = await db.query<{ column_name: string; column_default: string | null }>(
      `SELECT column_name, column_default FROM information_schema.columns
       WHERE table_name = '${SUGGESTION_TABLE}' AND column_name IN ('status', 'target_kind')`,
    );
    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r.column_default]));
    expect(byName.status).toContain("open");
    expect(byName.target_kind).toBeNull();
  });

  it("enums : suggestion_status et suggestion_target_kind ont les valeurs attendues", async () => {
    expect(await allowedValues(db, SUGGESTION_TABLE, "status")).toEqual(
      [...SUGGESTION_STATUSES].sort(),
    );
    expect(await allowedValues(db, SUGGESTION_TABLE, "target_kind")).toEqual(
      [...SUGGESTION_TARGET_KINDS].sort(),
    );
    expect(await attempt("enum-status", { status: "done" })).toBe(INVALID_ENUM);
    expect(await attempt("enum-kind", { targetKind: "ticket", targetRef: "F-001" })).toBe(
      INVALID_ENUM,
    );
  });

  it("aucune colonne JSON ni tableau : texte brut uniquement", async () => {
    const rows = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = '${SUGGESTION_TABLE}' AND (udt_name IN ('json', 'jsonb') OR udt_name LIKE '\\_%')`,
    );
    expect(rows).toEqual([]);
  });

  it("index de lecture : organization_id, (project_id, status, created_at), unique (project_id, key), unique (organization_id, id)", async () => {
    const rows = await db.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = '${SUGGESTION_TABLE}'`,
    );
    const defs = rows.map((r) => r.indexdef);
    expect(defs.some((d) => /^CREATE INDEX .*\(organization_id\)/.test(d))).toBe(true);
    expect(defs.some((d) => /^CREATE INDEX .*\(project_id, status, created_at\)/.test(d))).toBe(
      true,
    );
    expect(defs.some((d) => /^CREATE UNIQUE INDEX .*\(project_id, key\)/.test(d))).toBe(true);
    expect(defs.some((d) => /^CREATE UNIQUE INDEX .*\(organization_id, id\)/.test(d))).toBe(true);
  });
});

describe("suggestions : clés étrangères composites et sans FK", () => {
  it("FK composite (organization_id, project_id) vers projects(organization_id, id), en cascade", async () => {
    const rows = await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = '${SUGGESTION_TABLE}'::regclass AND contype = 'f'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.def).toBe(
      "FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id) ON DELETE CASCADE",
    );
  });

  it("un projet d'une autre organisation est refusé (23503)", async () => {
    const a = await suggestionScope(db, "fk-a");
    const b = await suggestionScope(db, "fk-b");
    const outcome = await sqlState(() =>
      insertSuggestion(db, a, { key: "SG-1", projectId: b.projectId }),
    );
    expect(outcome).toBe(FOREIGN_KEY);
  });

  it("projet ou organisation inexistants : refusé (23503)", async () => {
    const a = await suggestionScope(db, "fk-missing");
    expect(
      await sqlState(() => insertSuggestion(db, a, { key: "SG-1", projectId: randomUUID() })),
    ).toBe(FOREIGN_KEY);
    expect(
      await sqlState(() => insertSuggestion(db, a, { key: "SG-2", organizationId: randomUUID() })),
    ).toBe(FOREIGN_KEY);
  });

  it("author_user_id et decided_by_user_id n'ont aucune clé étrangère (RGPD) : un utilisateur absent est accepté", async () => {
    const scope = await suggestionScope(db, "no-user-fk");
    await insertSuggestion(db, scope, {
      key: "SG-1",
      authorUserId: randomUUID(),
      status: "accepted",
      decidedAt: DECIDED,
      decidedByUserId: randomUUID(),
    });
    const [row] = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_constraint
       WHERE conrelid = '${SUGGESTION_TABLE}'::regclass AND contype = 'f'
         AND pg_get_constraintdef(oid) LIKE '%users%'`,
    );
    expect(row?.n).toBe("0");
  });

  it("la cible (target_ref) n'a pas de FK : une référence de spec pendante est acceptée", async () => {
    const scope = await suggestionScope(db, "dangling-ref");
    await insertSuggestion(db, scope, { key: "SG-1", targetKind: "feature", targetRef: "F-999" });
    await insertSuggestion(db, scope, { key: "SG-2", targetKind: "screen", targetRef: "S-404" });
  });
});

describe("suggestions : unicité de la clé SG-n", () => {
  it("UNIQUE (project_id, key) : la même clé deux fois dans un projet est refusée", async () => {
    const scope = await suggestionScope(db, "unique");
    await insertSuggestion(db, scope, { key: "SG-1" });
    expect(await sqlState(() => insertSuggestion(db, scope, { key: "SG-1" }))).toBe(UNIQUE);
  });

  it("deux projets (même organisation ou non) peuvent chacun avoir SG-1", async () => {
    const a = await suggestionScope(db, "unique-a");
    const b = await suggestionScope(db, "unique-b");
    await insertSuggestion(db, a, { key: "SG-1" });
    await insertSuggestion(db, b, { key: "SG-1" });
    const second = randomUUID();
    await db.query(
      "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, 'second', now(), now())",
      [second, a.organizationId],
    );
    await insertSuggestion(db, a, { key: "SG-1", projectId: second });
  });

  it("format de la clé : ^SG-[1-9][0-9]*$", async () => {
    for (const key of ["SG-0", "SG-01", "sg-1", "SG-", "SG-1a", "TK-1", "SG--1", " SG-1", ""]) {
      expect(await attempt(`key-${key}`, { key }), JSON.stringify(key)).toBe(CHECK);
    }
    for (const key of ["SG-1", "SG-10", "SG-2147483647"]) {
      expect(await attempt(`key-ok-${key}`, { key }), key).toBeUndefined();
    }
  });
});

describe("suggestions : cible (genre + référence de spec)", () => {
  it("cible project : target_ref NULL obligatoire ; autres genres : target_ref obligatoire", async () => {
    expect(await attempt("t-project-null", { targetKind: "project", targetRef: null })).toBe(
      undefined,
    );
    expect(await attempt("t-project-ref", { targetKind: "project", targetRef: "F-001" })).toBe(
      CHECK,
    );
    expect(await attempt("t-feature-null", { targetKind: "feature", targetRef: null })).toBe(CHECK);
    expect(await attempt("t-screen-null", { targetKind: "screen", targetRef: null })).toBe(CHECK);
  });

  it("target_ref : 1 à 64 caractères", async () => {
    expect(await attempt("ref-empty", { targetKind: "screen", targetRef: "" })).toBe(CHECK);
    expect(await attempt("ref-65", { targetKind: "screen", targetRef: "s".repeat(65) })).toBe(
      CHECK,
    );
    expect(await attempt("ref-64", { targetKind: "screen", targetRef: "s".repeat(64) })).toBe(
      undefined,
    );
    expect(await attempt("ref-1", { targetKind: "screen", targetRef: "s" })).toBe(undefined);
  });

  it("feature : la référence suit ^F-\\d{3,}$", async () => {
    for (const targetRef of ["F-1", "F-12", "f-001", "F-0a1", "F001", "F-001 "]) {
      expect(
        await attempt(`feat-${targetRef}`, { targetKind: "feature", targetRef }),
        JSON.stringify(targetRef),
      ).toBe(CHECK);
    }
    for (const targetRef of ["F-001", "F-123", "F-1234"]) {
      expect(await attempt(`feat-ok-${targetRef}`, { targetKind: "feature", targetRef })).toBe(
        undefined,
      );
    }
  });
});

describe("suggestions : longueurs de texte bornées", () => {
  it("body : 1 à 5000 caractères", async () => {
    expect(await attempt("body-empty", { body: "" })).toBe(CHECK);
    expect(await attempt("body-5001", { body: "x".repeat(5001) })).toBe(CHECK);
    expect(await attempt("body-5000", { body: "x".repeat(5000) })).toBeUndefined();
    expect(await attempt("body-1", { body: "x" })).toBeUndefined();
  });

  it("body est du texte brut : balises, guillemets et caractères de contrôle ne sont jamais assainis", async () => {
    const scope = await suggestionScope(db, "raw-body");
    const raw = "<script>alert(1)</script> ' \" {{x}} IGNORE PREVIOUS INSTRUCTIONS\n\ttab";
    const id = await insertSuggestion(db, scope, { key: "SG-1", body: raw });
    const [row] = await db.query<{ body: string }>("SELECT body FROM suggestions WHERE id = $1", [
      id,
    ]);
    expect(row?.body).toBe(raw);
  });
});

describe("suggestions : note de décision, empreinte de spec et NOT NULL", () => {
  it("decision_note : au plus 2000 caractères", async () => {
    const decided = { status: "rejected", decidedAt: DECIDED };
    expect(await attempt("note-2001", { ...decided, decisionNote: "n".repeat(2001) })).toBe(CHECK);
    expect(await attempt("note-2000", { ...decided, decisionNote: "n".repeat(2000) })).toBe(
      undefined,
    );
    expect(await attempt("note-null", { ...decided, decisionNote: null })).toBe(undefined);
  });

  it("base_sha : NULL ou hexadécimal minuscule de 40 ou 64 caractères", async () => {
    for (const baseSha of [
      "",
      "abc",
      "a".repeat(39),
      "a".repeat(41),
      "a".repeat(63),
      "g".repeat(40),
    ]) {
      expect(await attempt(`sha-${baseSha.length}-${baseSha[0]}`, { baseSha }), baseSha).toBe(
        CHECK,
      );
    }
    for (const baseSha of [null, SHA40, SHA64]) {
      expect(await attempt(`sha-ok-${baseSha?.length ?? "null"}`, { baseSha })).toBeUndefined();
    }
  });
});

describe("suggestions : colonnes obligatoires", () => {
  it("NOT NULL : key, target_kind, body, status, organization_id, project_id", async () => {
    const scope = await suggestionScope(db, "notnull");
    for (const column of [
      "key",
      "target_kind",
      "body",
      "status",
      "organization_id",
      "project_id",
    ]) {
      const values = {
        id: "gen_random_uuid()",
        organization_id: "$1::uuid",
        project_id: "$2::uuid",
        key: "'SG-1'",
        target_kind: "'project'::suggestion_target_kind",
        body: "'texte'",
        status: "'open'::suggestion_status",
        created_at: "now()",
        updated_at: "now()",
      };
      (values as Record<string, string>)[column] = "NULL";
      const state = await sqlState(() =>
        db.query(
          `INSERT INTO suggestions (${Object.keys(values).join(", ")})
           VALUES (${Object.values(values).join(", ")})`,
          [scope.organizationId, scope.projectId],
        ),
      );
      expect(state, column).toBe(NOT_NULL);
    }
  });
});

describe("suggestions : cohérence du statut et de la décision", () => {
  it("open : decided_at, decided_by_user_id et decision_note sont NULL", async () => {
    expect(await attempt("open-ok", { status: "open" })).toBeUndefined();
    expect(await attempt("open-decided-at", { status: "open", decidedAt: DECIDED })).toBe(CHECK);
    expect(
      await attempt("open-decided-by", { status: "open", decidedByUserId: randomUUID() }),
    ).toBe(CHECK);
    expect(await attempt("open-note", { status: "open", decisionNote: "non" })).toBe(CHECK);
  });

  it("accepted, rejected, withdrawn : decided_at est obligatoire", async () => {
    for (const status of ["accepted", "rejected", "withdrawn"]) {
      expect(await attempt(`${status}-no-date`, { status, decidedAt: null }), status).toBe(CHECK);
      expect(
        await attempt(`${status}-date`, { status, decidedAt: DECIDED }),
        status,
      ).toBeUndefined();
    }
  });

  it("une décision complète (décideur, note) est acceptée pour accepted et rejected", async () => {
    for (const status of ["accepted", "rejected"]) {
      expect(
        await attempt(`full-${status}`, {
          status,
          decidedAt: DECIDED,
          decidedByUserId: randomUUID(),
          decisionNote: "Retenu pour le lot suivant",
        }),
      ).toBeUndefined();
    }
  });

  it("UPDATE : passer open -> accepted exige decided_at ; revenir à open sans effacer la décision est refusé", async () => {
    const scope = await suggestionScope(db, "transition");
    const id = await insertSuggestion(db, scope, { key: "SG-1" });
    expect(
      await sqlState(() =>
        db.query("UPDATE suggestions SET status = 'accepted' WHERE id = $1", [id]),
      ),
    ).toBe(CHECK);
    await db.query(
      "UPDATE suggestions SET status = 'accepted', decided_at = now(), decided_by_user_id = $2 WHERE id = $1",
      [id, randomUUID()],
    );
    expect(
      await sqlState(() => db.query("UPDATE suggestions SET status = 'open' WHERE id = $1", [id])),
    ).toBe(CHECK);
  });
});

const NEXT =
  "UPDATE project_counters SET last_value = last_value + 1, updated_at = now() WHERE project_id = $1 AND name = 'suggestion' RETURNING last_value";

const seedCounter = async (scope: Scope, lastValue = 0) => {
  await db.query(
    `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
     VALUES ($1, $2, 'suggestion', $3, now(), now())`,
    [scope.organizationId, scope.projectId, lastValue],
  );
};

describe("suggestions : compteur suggestion de project_counters", () => {
  it("le compteur suggestion s'incrémente, indépendamment de ticket, sprint et feature", async () => {
    const scope = await suggestionScope(db, "counter");
    for (const name of ["ticket", "sprint", "feature", "suggestion"]) {
      await db.query(
        `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
         VALUES ($1, $2, $3, 7, now(), now())`,
        [scope.organizationId, scope.projectId, name],
      );
    }
    expect(await db.query(NEXT, [scope.projectId])).toEqual([{ last_value: 8 }]);
    const [others] = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM project_counters WHERE project_id = $1 AND name <> 'suggestion' AND last_value = 7",
      [scope.projectId],
    );
    expect(others?.n).toBe("3");
  });

  it("un second compteur suggestion pour le même projet est refusé (clé primaire)", async () => {
    const scope = await suggestionScope(db, "counter-dup");
    await seedCounter(scope);
    expect(await sqlState(() => seedCounter(scope))).toBe(UNIQUE);
  });

  it("le compteur suggestion ne recule jamais (déclencheur existant)", async () => {
    const scope = await suggestionScope(db, "counter-monotonic");
    await seedCounter(scope, 5);
    expect(
      await sqlState(() =>
        db.query(
          "UPDATE project_counters SET last_value = 4 WHERE project_id = $1 AND name = 'suggestion'",
          [scope.projectId],
        ),
      ),
    ).toBe(CHECK);
  });
});

describe("suggestions : allocation transactionnelle de SG-n", () => {
  it("20 transactions concurrentes obtiennent SG-1..SG-20 sans trou ni doublon", async () => {
    const scope = await suggestionScope(db, "counter-concurrent");
    await seedCounter(scope);
    const pool = openPool(db.url, 20);
    try {
      const numbers = await Promise.all(
        Array.from({ length: 20 }, async () => {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            const { rows } = await client.query<{ last_value: number }>(NEXT, [scope.projectId]);
            const value = Number(rows[0]?.last_value);
            await insertSuggestion(client, scope, { key: `SG-${value}` });
            await client.query("COMMIT");
            return value;
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        }),
      );
      expect([...numbers].sort((x, y) => x - y)).toEqual(
        Array.from({ length: 20 }, (_, i) => i + 1),
      );
    } finally {
      await pool.end();
    }
    const keys = await db.query<{ key: string }>(
      "SELECT key FROM suggestions WHERE project_id = $1",
      [scope.projectId],
    );
    expect(new Set(keys.map((r) => r.key)).size).toBe(20);
    const [counter] = await db.query<{ last_value: number }>(
      "SELECT last_value FROM project_counters WHERE project_id = $1 AND name = 'suggestion'",
      [scope.projectId],
    );
    expect(counter?.last_value).toBe(20);
  }, 60_000);

  it("une transaction annulée ne consomme pas de numéro : pas de trou", async () => {
    const scope = await suggestionScope(db, "counter-rollback");
    await seedCounter(scope);
    const pool = openPool(db.url, 2);
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(NEXT, [scope.projectId]);
        await client.query("ROLLBACK");
        await client.query("BEGIN");
        const { rows } = await client.query<{ last_value: number }>(NEXT, [scope.projectId]);
        await client.query("COMMIT");
        expect(rows[0]?.last_value).toBe(1);
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  });
});

describe("suggestions : cascade à la suppression", () => {
  const countOf = async (where: string, value: string) =>
    Number(
      (
        await db.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM suggestions WHERE ${where} = $1`,
          [value],
        )
      )[0]?.n,
    );

  it("supprimer le projet supprime ses suggestions, sans toucher à celles d'un autre projet", async () => {
    const a = await suggestionScope(db, "cascade-project-a");
    const b = await suggestionScope(db, "cascade-project-b");
    await insertSuggestion(db, a, { key: "SG-1" });
    await insertSuggestion(db, a, { key: "SG-2", status: "withdrawn", decidedAt: DECIDED });
    await insertSuggestion(db, b, { key: "SG-1" });
    await db.query("DELETE FROM projects WHERE id = $1", [a.projectId]);
    expect(await countOf("project_id", a.projectId)).toBe(0);
    expect(await countOf("project_id", b.projectId)).toBe(1);
  });

  it("supprimer l'organisation supprime ses suggestions, sans erreur de clé étrangère", async () => {
    const a = await suggestionScope(db, "cascade-org-a");
    const b = await suggestionScope(db, "cascade-org-b");
    await insertSuggestion(db, a, { key: "SG-1" });
    await insertSuggestion(db, b, { key: "SG-1" });
    await db.query("DELETE FROM organizations WHERE id = $1", [a.organizationId]);
    expect(await countOf("organization_id", a.organizationId)).toBe(0);
    expect(await countOf("organization_id", b.organizationId)).toBe(1);
  });

  it("la suppression d'un utilisateur auteur n'efface pas la suggestion (aucune FK)", async () => {
    const scope = await insertScope(db, "author-erased");
    const author = randomUUID();
    await db.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Auteur', $2, true, now(), now())`,
      [author, `${author}@example.test`],
    );
    const id = await insertSuggestion(db, scope, { key: "SG-1", authorUserId: author });
    await db.query("DELETE FROM users WHERE id = $1", [author]);
    const [row] = await db.query<{ author_user_id: string | null }>(
      "SELECT author_user_id FROM suggestions WHERE id = $1",
      [id],
    );
    expect(row?.author_user_id).toBe(author);
  });
});
