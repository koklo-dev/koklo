import { readFileSync } from "node:fs";
import {
  DEPENDENCY_TYPES,
  SENSITIVITIES,
  TICKET_PACKAGES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
} from "@koklo/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  compositeKeyTables,
  runPrismaOrThrow,
  schemaPath,
  stampExemptTables,
} from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { TICKET_TABLES } from "./support/ticket-fixtures.ts";

const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const HOLDER_KINDS = ["member", "runner"];

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

async function publicTables(): Promise<string[]> {
  const rows = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`,
  );
  return rows.map((row) => row.table_name);
}

describe("TK-28 C1 incident 6 : aucune colonne tableau", () => {
  it("les 11 tables existent (garde contre un test vacueux)", async () => {
    expect(await publicTables()).toEqual(expect.arrayContaining([...TICKET_TABLES]));
  });

  it("aucune colonne de type ARRAY dans le schéma public (information_schema et pg_type)", async () => {
    expect(await publicTables()).toEqual(expect.arrayContaining(["tickets", "leases"]));

    const viaInformationSchema = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND data_type = 'ARRAY'`,
    );
    const viaCatalog = await db.query<{ relname: string; attname: string }>(
      `SELECT c.relname, a.attname
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_type t ON t.oid = a.atttypid
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
         AND t.typcategory = 'A'`,
    );

    expect(viaInformationSchema).toEqual([]);
    expect(viaCatalog).toEqual([]);
  });

  it("schema.prisma ne déclare aucun champ liste scalaire ou d'enum", () => {
    const source = readFileSync(schemaPath, "utf8");
    expect(source).toMatch(/^model Ticket \{/m);

    const enumNames = [...source.matchAll(/^enum (\w+) \{/gm)].map((m) => m[1]);
    const scalars = [
      "String",
      "Int",
      "BigInt",
      "Float",
      "Decimal",
      "Boolean",
      "DateTime",
      "Json",
      "Bytes",
      ...enumNames,
    ].join("|");
    const listField = new RegExp(`^\\s+\\w+\\s+(?:${scalars})\\[\\]`, "gm");

    expect(source.match(listField) ?? []).toEqual([]);
  });

  it("labels et features sont des tables de liaison à clé primaire composite", async () => {
    const rows = await db.query<{ table_name: string; columns: string }>(
      `SELECT k.table_name, string_agg(k.column_name, ',' ORDER BY k.ordinal_position) AS columns
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage k
         ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
       WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
         AND k.table_name IN ('ticket_labels', 'ticket_features')
       GROUP BY k.table_name ORDER BY k.table_name`,
    );

    expect(rows).toEqual([
      { table_name: "ticket_features", columns: "ticket_id,feature_ref" },
      { table_name: "ticket_labels", columns: "ticket_id,label" },
    ]);
  });
});

/** Valeurs autorisées d'une colonne : enum Postgres natif, ou à défaut CHECK `col IN (...)`. */
async function allowedValues(table: string, column: string): Promise<string[]> {
  const enumRows = await db.query<{ label: string }>(
    `SELECT e.enumlabel AS label
     FROM information_schema.columns c
     JOIN pg_type t ON t.typname = c.udt_name
     JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE c.table_schema = 'public' AND c.table_name = $1 AND c.column_name = $2`,
    [table, column],
  );
  if (enumRows.length > 0) return enumRows.map((row) => row.label).sort();

  const checks = await db.query<{ def: string }>(
    `SELECT pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class cl ON cl.oid = con.conrelid
     JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = ANY (con.conkey)
     WHERE con.contype = 'c' AND cl.relname = $1 AND a.attname = $2`,
    [table, column],
  );
  return [...new Set(checks.flatMap((c) => [...c.def.matchAll(/'([^']+)'/g)].map((m) => m[1])))]
    .filter((v): v is string => v !== undefined)
    .sort();
}

describe("TK-28 C7 parité des valeurs fermées avec @koklo/domain", () => {
  const closedLists: [string, string, readonly string[]][] = [
    ["tickets", "status", TICKET_STATUSES],
    ["tickets", "type", TICKET_TYPES],
    ["tickets", "priority", TICKET_PRIORITIES],
    ["tickets", "pkg", TICKET_PACKAGES],
    ["tickets", "sensitivity", SENSITIVITIES],
    ["tickets", "assignee_kind", HOLDER_KINDS],
    ["ticket_dependencies", "type", DEPENDENCY_TYPES],
    ["leases", "holder_kind", HOLDER_KINDS],
    ["sprints", "status", ["planned", "active", "closed"]],
    ["ticket_comments", "target_kind", ["ticket", "feature", "screen", "change_request"]],
    ["ticket_comments", "author_kind", ["human", "agent", "client", "system"]],
    ["audit_log", "actor_kind", ["human", "agent", "runner", "system"]],
    ["project_counters", "name", ["ticket", "sprint"]],
  ];

  it.each(closedLists)("%s.%s = valeurs exactes attendues", async (table, column, expected) => {
    expect(await allowedValues(table, column)).toEqual([...expected].sort());
  });
});

describe("TK-28 C7 champs du bail et de l'état, instants", () => {
  it("les champs du bail et de l'état suivent les noms du domaine", async () => {
    const rows = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name IN ('leases', 'project_states')`,
    );
    const names = (table: string) =>
      rows.filter((r) => r.table_name === table).map((r) => r.column_name);

    expect(names("leases")).toEqual(
      expect.arrayContaining([
        "ticket_id",
        "holder_kind",
        "holder_id",
        "branch",
        "worktree",
        "acquired_at",
        "heartbeat_at",
        "expires_at",
        "ttl_ms",
        "released_at",
      ]),
    );
    expect(names("project_states")).toEqual(
      expect.arrayContaining(["project_id", "version", "content"]),
    );
  });

  it("tous les instants (*_at) des tables du ticket sont des timestamptz", async () => {
    const rows = await db.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY ($1) AND column_name LIKE '%\\_at'`,
      [[...TICKET_TABLES]],
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const { table_name, column_name, data_type } of rows) {
      expect(data_type, `${table_name}.${column_name}`).toBe("timestamp with time zone");
    }
    const columns = rows.map((r) => `${r.table_name}.${r.column_name}`);
    expect(columns).toEqual(
      expect.arrayContaining(["leases.expires_at", "leases.released_at", "audit_log.occurred_at"]),
    );
  });
});

describe("TK-28 C10 conventions §18.1", () => {
  it("tables et colonnes en snake_case", async () => {
    const rows = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY ($1)`,
      [[...TICKET_TABLES]],
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const { table_name, column_name } of rows) {
      expect(table_name).toMatch(SNAKE_CASE);
      expect(column_name, `${table_name}.${column_name}`).toMatch(SNAKE_CASE);
    }
  });

  it("PK uuid et created_at/updated_at NOT NULL, sauf tables à clé composite et audit_log", async () => {
    const withUuidKey = TICKET_TABLES.filter((t) => !compositeKeyTables.includes(t));
    const stamped = TICKET_TABLES.filter((t) => !stampExemptTables.includes(t));
    const pks = await db.query<{ table_name: string; data_type: string }>(
      `SELECT k.table_name, c.data_type
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage k
         ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
       JOIN information_schema.columns c
         ON c.table_schema = k.table_schema AND c.table_name = k.table_name AND c.column_name = k.column_name
       WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'`,
    );
    for (const table of withUuidKey) {
      expect(pks.find((p) => p.table_name === table)?.data_type, `PK de ${table}`).toBe("uuid");
    }

    const stamps = await db.query<{ table_name: string; column_name: string; is_nullable: string }>(
      `SELECT table_name, column_name, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name IN ('created_at', 'updated_at')`,
    );
    for (const table of stamped) {
      for (const column of ["created_at", "updated_at"]) {
        const found = stamps.find((s) => s.table_name === table && s.column_name === column);
        expect(found?.is_nullable, `${table}.${column} NOT NULL`).toBe("NO");
      }
    }
  });
});

describe("TK-28 C10 conventions §18.1 (suite)", () => {
  it("audit_log : pas de updated_at (jamais modifiée), occurred_at NOT NULL", async () => {
    const rows = await db.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'audit_log'`,
    );
    const byName = new Map(rows.map((r) => [r.column_name, r.is_nullable]));

    expect(byName.has("updated_at")).toBe(false);
    expect(byName.get("occurred_at")).toBe("NO");
  });

  it("tables de liaison : clé primaire composite portant organization_id", async () => {
    const rows = await db.query<{ table_name: string; n: string }>(
      `SELECT k.table_name, count(*)::text AS n
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage k
         ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
       WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
         AND k.table_name = ANY ($1)
       GROUP BY k.table_name`,
      [[...compositeKeyTables]],
    );

    expect(rows.map((r) => r.table_name).sort()).toEqual([...compositeKeyTables].sort());
    for (const { table_name, n } of rows) {
      expect(Number(n), table_name).toBeGreaterThanOrEqual(2);
    }
  });

  it("deleted_at existe uniquement sur tickets et ticket_comments", async () => {
    const rows = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'deleted_at' ORDER BY table_name`,
    );

    expect(rows.map((r) => r.table_name)).toEqual(["ticket_comments", "tickets"]);
  });
});

describe("TK-28 C9 multi-tenance au niveau du schéma", () => {
  it("chaque table porte organization_id NOT NULL, indexé en tête d'un index", async () => {
    const columns = await db.query<{ table_name: string; is_nullable: string }>(
      `SELECT table_name, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'organization_id' AND table_name = ANY ($1)`,
      [[...TICKET_TABLES]],
    );
    expect(columns.map((c) => c.table_name).sort()).toEqual([...TICKET_TABLES].sort());
    for (const column of columns) {
      expect(column.is_nullable, column.table_name).toBe("NO");
    }

    const indexed = await db.query<{ tablename: string }>(
      `SELECT DISTINCT tablename FROM pg_indexes
       WHERE schemaname = 'public' AND indexdef ~ '\\(organization_id[,)]'`,
    );
    const indexedTables = indexed.map((i) => i.tablename);
    for (const table of TICKET_TABLES) {
      expect(indexedTables, `index organization_id sur ${table}`).toContain(table);
    }
  });

  it("FK vers organizations et projects en ON DELETE CASCADE", async () => {
    const fks = await db.query<{ child: string; parent: string; on_delete: string }>(
      `SELECT c.relname AS child, p.relname AS parent, con.confdeltype AS on_delete
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_class p ON p.oid = con.confrelid
       WHERE con.contype = 'f' AND c.relname = ANY ($1) AND p.relname IN ('organizations', 'projects')`,
      [[...TICKET_TABLES]],
    );

    for (const table of TICKET_TABLES) {
      expect(
        fks.some((f) => f.child === table && f.parent === "organizations"),
        `FK ${table} -> organizations`,
      ).toBe(true);
    }
    for (const table of ["tickets", "sprints", "project_states", "project_counters"]) {
      expect(
        fks.some((f) => f.child === table && f.parent === "projects"),
        `FK ${table} -> projects`,
      ).toBe(true);
    }
    for (const fk of fks) {
      expect(fk.on_delete, `${fk.child} -> ${fk.parent}`).toBe("c");
    }
  });
});
