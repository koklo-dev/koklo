import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  insertCredential,
  insertState,
  insertUser,
  type OauthScene,
  oauthScene,
} from "./support/oauth-fixtures.ts";
import { insertInstallation } from "./support/spec-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-48a1 : contraintes des deux tables, prouvées par SQL direct. États : usage unique
 * (`consumed_at`), expiration au plus 10 minutes après la création, nonce unique, isolation par
 * clé étrangère composite. Jetons : un jeton par (utilisateur, installation), nonce de 12 octets,
 * `key_version` >= 1, chiffré plus long que le tag GCM.
 */
const FOREIGN_KEY = "23503";
const UNIQUE = "23505";
const CHECK = "23514";

let db: TestDatabase;
let a: OauthScene;
let b: OauthScene;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
  a = await oauthScene(db, "oauth-a");
  b = await oauthScene(db, "oauth-b");
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

describe("provider_auth_states : structure", () => {
  it("colonnes attendues, types et nullabilité", async () => {
    const rows = await db.query<{ column_name: string; udt_name: string; is_nullable: string }>(
      `SELECT column_name, udt_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'provider_auth_states' ORDER BY column_name`,
    );
    const columns = Object.fromEntries(
      rows.map((r) => [r.column_name, `${r.udt_name}/${r.is_nullable}`]),
    );
    expect(columns).toEqual({
      consumed_at: "timestamptz/YES",
      created_at: "timestamptz/NO",
      expires_at: "timestamptz/NO",
      id: "uuid/NO",
      installation_id: "uuid/YES",
      nonce: "text/NO",
      organization_id: "uuid/NO",
      updated_at: "timestamptz/NO",
      user_id: "uuid/NO",
    });
  });

  it("index partiel des états en attente, par utilisateur (plafond de 20, WHERE consumed_at IS NULL)", async () => {
    const rows = await db.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'provider_auth_states'`,
    );
    const partial = rows.find((r) => /\(user_id\)/.test(r.indexdef) && /WHERE/.test(r.indexdef));
    expect(partial?.indexdef, rows.map((r) => r.indexdef).join("\n")).toMatch(
      /WHERE \(?consumed_at IS NULL\)?/,
    );
  });

  it("index sur expires_at pour la purge opportuniste", async () => {
    const rows = await db.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'provider_auth_states'`,
    );
    expect(rows.some((r) => /\(expires_at\)/.test(r.indexdef))).toBe(true);
  });
});

describe("provider_auth_states : usage unique et expiration de 10 minutes", () => {
  it("un état valide s'insère, avec ou sans installation (ré-autorisation)", async () => {
    await insertState(db, a);
    await insertState(db, a, { installationId: a.installationId });
  });

  it("expires_at au-delà de created_at + 10 minutes : refusé par CHECK", async () => {
    expect(await sqlState(() => insertState(db, a, { ttlSeconds: 601 }))).toBe(CHECK);
    expect(await sqlState(() => insertState(db, a, { ttlSeconds: 3600 }))).toBe(CHECK);
  });

  it("expires_at antérieur ou égal à created_at : refusé par CHECK", async () => {
    expect(await sqlState(() => insertState(db, a, { ttlSeconds: 0 }))).toBe(CHECK);
    expect(await sqlState(() => insertState(db, a, { ttlSeconds: -5 }))).toBe(CHECK);
  });

  it("exactement 10 minutes : accepté", async () => {
    await insertState(db, a, { ttlSeconds: 600 });
  });

  it("nonce unique : un second état avec le même nonce est refusé", async () => {
    const nonce = randomUUID();
    await insertState(db, a, { nonce });
    expect(await sqlState(() => insertState(db, b, { nonce }))).toBe(UNIQUE);
  });

  it("consommation atomique : le second UPDATE ... WHERE consumed_at IS NULL ne touche aucune ligne", async () => {
    const id = await insertState(db, a);
    const consume = () =>
      db.query<{ id: string }>(
        `UPDATE provider_auth_states SET consumed_at = now()
         WHERE id = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING id`,
        [id],
      );
    expect(await consume()).toHaveLength(1);
    expect(await consume()).toHaveLength(0);
  });

  it("un état échu ne se consomme pas (garde expires_at > now())", async () => {
    const id = await insertState(db, a, { ttlSeconds: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const rows = await db.query(
      `UPDATE provider_auth_states SET consumed_at = now()
       WHERE id = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING id`,
      [id],
    );
    expect(rows).toHaveLength(0);
  });
});

describe("provider_auth_states : multi-tenant", () => {
  it("l'installation d'une autre organisation est refusée (clé étrangère composite)", async () => {
    expect(await sqlState(() => insertState(db, a, { installationId: b.installationId }))).toBe(
      FOREIGN_KEY,
    );
  });

  it("organisation ou utilisateur inexistant : refusé", async () => {
    expect(await sqlState(() => insertState(db, a, { organizationId: randomUUID() }))).toBe(
      FOREIGN_KEY,
    );
    expect(await sqlState(() => insertState(db, a, { userId: randomUUID() }))).toBe(FOREIGN_KEY);
  });

  it("supprimer l'organisation, l'utilisateur ou l'installation supprime les états liés", async () => {
    const c = await oauthScene(db, "oauth-cascade");
    const viaInstallation = await insertState(db, c, { installationId: c.installationId });
    const viaUser = await insertState(db, c);
    const count = async (id: string) =>
      (await db.query("SELECT 1 FROM provider_auth_states WHERE id = $1", [id])).length;

    await db.query("DELETE FROM provider_installations WHERE id = $1", [c.installationId]);
    expect(await count(viaInstallation)).toBe(0);
    expect(await count(viaUser)).toBe(1);
    await db.query("DELETE FROM users WHERE id = $1", [c.userId]);
    expect(await count(viaUser)).toBe(0);
    const d = await oauthScene(db, "oauth-cascade-org");
    const viaOrg = await insertState(db, d);
    await db.query("DELETE FROM organizations WHERE id = $1", [d.scope.organizationId]);
    expect(await count(viaOrg)).toBe(0);
  });
});

describe("provider_user_credentials : structure et contraintes", () => {
  it("colonnes attendues : chiffré et nonce en bytea, key_version entier", async () => {
    const rows = await db.query<{ column_name: string; udt_name: string; is_nullable: string }>(
      `SELECT column_name, udt_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'provider_user_credentials' ORDER BY column_name`,
    );
    const columns = Object.fromEntries(
      rows.map((r) => [r.column_name, `${r.udt_name}/${r.is_nullable}`]),
    );
    expect(columns).toMatchObject({
      ciphertext: "bytea/NO",
      nonce: "bytea/NO",
      key_version: "int4/NO",
      expires_at: "timestamptz/NO",
      refresh_expires_at: "timestamptz/YES",
      installation_id: "uuid/NO",
      organization_id: "uuid/NO",
      user_id: "uuid/NO",
    });
    expect(Object.keys(columns).sort()).toEqual(
      [
        "ciphertext",
        "created_at",
        "expires_at",
        "id",
        "installation_id",
        "key_version",
        "nonce",
        "organization_id",
        "refresh_expires_at",
        "updated_at",
        "user_id",
      ].sort(),
    );
  });

  it("key_version vaut 1 par défaut", async () => {
    const c = await oauthScene(db, "oauth-default");
    await db.query(
      `INSERT INTO provider_user_credentials (id, organization_id, user_id, installation_id, ciphertext,
         nonce, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now(), now())`,
      [
        randomUUID(),
        c.scope.organizationId,
        c.userId,
        c.installationId,
        Buffer.alloc(40),
        Buffer.alloc(12),
      ],
    );
    const [row] = await db.query<{ key_version: number }>(
      "SELECT key_version FROM provider_user_credentials WHERE user_id = $1",
      [c.userId],
    );
    expect(row?.key_version).toBe(1);
  });
});

describe("provider_user_credentials : contraintes de valeurs", () => {
  it("un seul jeton par (utilisateur, installation)", async () => {
    const c = await oauthScene(db, "oauth-unique");
    await insertCredential(db, c);
    expect(await sqlState(() => insertCredential(db, c))).toBe(UNIQUE);
    const otherUser = await insertUser(db, "second");
    await insertCredential(db, c, { userId: otherUser });
  });

  it("nonce de 12 octets exigé", async () => {
    const c = await oauthScene(db, "oauth-nonce");
    expect(await sqlState(() => insertCredential(db, c, { nonce: Buffer.alloc(11) }))).toBe(CHECK);
    expect(await sqlState(() => insertCredential(db, c, { nonce: Buffer.alloc(13) }))).toBe(CHECK);
  });

  it("key_version >= 1", async () => {
    const c = await oauthScene(db, "oauth-version");
    expect(await sqlState(() => insertCredential(db, c, { keyVersion: 0 }))).toBe(CHECK);
    expect(await sqlState(() => insertCredential(db, c, { keyVersion: -1 }))).toBe(CHECK);
  });

  it("chiffré d'au moins un octet en plus du tag de 16 octets", async () => {
    const c = await oauthScene(db, "oauth-cipher");
    expect(await sqlState(() => insertCredential(db, c, { ciphertext: Buffer.alloc(16) }))).toBe(
      CHECK,
    );
    expect(await sqlState(() => insertCredential(db, c, { ciphertext: Buffer.alloc(0) }))).toBe(
      CHECK,
    );
    await insertCredential(db, c, { ciphertext: Buffer.alloc(17) });
  });
});

describe("provider_user_credentials : multi-tenant et cascades", () => {
  it("l'installation d'une autre organisation est refusée (clé étrangère composite)", async () => {
    expect(
      await sqlState(() => insertCredential(db, a, { installationId: b.installationId })),
    ).toBe(FOREIGN_KEY);
  });

  it("une installation de la même organisation est acceptée", async () => {
    const other = await insertInstallation(db, a.scope);
    await insertCredential(db, a, { installationId: other });
  });

  it("supprimer l'installation, l'utilisateur ou l'organisation supprime les jetons", async () => {
    const c = await oauthScene(db, "oauth-cred-cascade");
    const second = await insertInstallation(db, c.scope);
    await insertCredential(db, c);
    await insertCredential(db, c, { installationId: second });
    const left = async () =>
      (
        await db.query("SELECT 1 FROM provider_user_credentials WHERE organization_id = $1", [
          c.scope.organizationId,
        ])
      ).length;

    await db.query("DELETE FROM provider_installations WHERE id = $1", [second]);
    expect(await left()).toBe(1);
    await db.query("DELETE FROM users WHERE id = $1", [c.userId]);
    expect(await left()).toBe(0);
    const d = await oauthScene(db, "oauth-cred-org");
    await insertCredential(db, d);
    await db.query("DELETE FROM organizations WHERE id = $1", [d.scope.organizationId]);
    expect(
      (await db.query("SELECT 1 FROM provider_user_credentials WHERE user_id = $1", [d.userId]))
        .length,
    ).toBe(0);
  });
});
