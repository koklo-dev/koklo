import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { LLM_PROVIDER_IDS } from "@koklo/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow, schemaPath } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  aadOf,
  insertLlmCredential,
  LLM_COLUMNS,
  LLM_TABLE,
  llmScope,
} from "./support/llm-credentials-fixtures.ts";
import { allowedValues } from "./support/spec-fixtures.ts";

/**
 * TK-51a : contraintes de `llm_provider_credentials`, prouvées par SQL direct. Un identifiant par
 * (organisation, fournisseur) ; nonce de 12 octets, `key_version` >= 1, chiffré de 17 à 2064 octets ;
 * aucune colonne AAD (dérivée de la ligne), aucune colonne de clé en clair ; cascade à la suppression
 * de l'organisation.
 */
const FOREIGN_KEY = "23503";
const UNIQUE = "23505";
const CHECK = "23514";
const INVALID_ENUM = "22P02";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

/** SQLSTATE d'une erreur capturée ; `undefined` si l'insertion a réussi (le résultat est alors un id). */
const sqlState = (outcome: unknown): string | undefined =>
  typeof outcome === "object" && outcome !== null ? (outcome as { code?: string }).code : undefined;

const orgOf = async (label: string) => (await llmScope(db, label)).organizationId;

describe("llm_provider_credentials : structure", () => {
  it("colonnes exactes : ciphertext, nonce en bytea, key_version int, aucune colonne AAD", async () => {
    const rows = await db.query<{ column_name: string; udt_name: string; is_nullable: string }>(
      `SELECT column_name, udt_name, is_nullable FROM information_schema.columns
       WHERE table_name = '${LLM_TABLE}' ORDER BY column_name`,
    );
    const columns = Object.fromEntries(
      rows.map((r) => [r.column_name, `${r.udt_name}/${r.is_nullable}`]),
    );
    expect(columns).toEqual(LLM_COLUMNS);
    expect(Object.keys(columns).filter((name) => /aad|associated/i.test(name))).toEqual([]);
  });

  it("aucune colonne de clé en clair : seul default_model est du texte, tout le secret est bytea", async () => {
    const rows = await db.query<{ column_name: string; udt_name: string }>(
      `SELECT column_name, udt_name FROM information_schema.columns
       WHERE table_name = '${LLM_TABLE}' AND udt_name IN ('text', 'varchar', 'jsonb', 'json')`,
    );
    expect(rows.map((r) => r.column_name)).toEqual(["default_model"]);
    const names = Object.keys(LLM_COLUMNS).filter((c) =>
      /(^|_)(api_?key|secret|plain|clear|token|hint|last4|suffix)(_|$)/i.test(c),
    );
    expect(names).toEqual([]);
  });

  it("key_version vaut 1 par défaut et provider n'a pas de défaut", async () => {
    const rows = await db.query<{ column_name: string; column_default: string | null }>(
      `SELECT column_name, column_default FROM information_schema.columns
       WHERE table_name = '${LLM_TABLE}' AND column_name IN ('key_version', 'provider')`,
    );
    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r.column_default]));
    expect(byName.key_version).toBe("1");
    expect(byName.provider).toBeNull();
    const org = await orgOf("llm-default");
    await db.query(
      `INSERT INTO ${LLM_TABLE} (id, organization_id, provider, ciphertext, nonce, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'openai', $2, $3, now(), now())`,
      [org, Buffer.alloc(40), Buffer.alloc(12)],
    );
    const [row] = await db.query<{ key_version: number }>(
      `SELECT key_version FROM ${LLM_TABLE} WHERE organization_id = $1`,
      [org],
    );
    expect(row?.key_version).toBe(1);
  });
});

describe("llm_provider_credentials : index et modèle Prisma", () => {
  it("organization_id est indexé", async () => {
    const rows = await db.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = '${LLM_TABLE}'`,
    );
    expect(rows.some((r) => /\(organization_id\)/.test(r.indexdef))).toBe(true);
  });

  it("le modèle Prisma n'a aucun champ de clé en clair ni d'AAD", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const model = /model LlmProviderCredential \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
    expect(model, "modèle LlmProviderCredential").not.toBe("");
    const fields = model
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((name): name is string => !!name && /^[a-z]/.test(name));
    expect(fields.filter((f) => /aad|plain|secret|apiKey|hint|clear/i.test(f))).toEqual([]);
    expect(fields).toEqual(
      expect.arrayContaining(["ciphertext", "nonce", "keyVersion", "defaultModel", "lastUsedAt"]),
    );
  });
});

describe("llm_provider_credentials : enum llm_provider et parité avec le domaine", () => {
  it("llm_provider = LLM_PROVIDER_IDS exactement", async () => {
    expect(await allowedValues(db, LLM_TABLE, "provider")).toEqual([...LLM_PROVIDER_IDS].sort());
  });

  it("'fake' n'est jamais un fournisseur stockable", async () => {
    expect(await allowedValues(db, LLM_TABLE, "provider")).not.toContain("fake");
    const org = await orgOf("llm-fake");
    const error = await insertLlmCredential(db, { organizationId: org, provider: "fake" }).catch(
      (e: unknown) => e,
    );
    expect(sqlState(error)).toBe(INVALID_ENUM);
  });

  it("chaque fournisseur du domaine est acceptable, une fois par organisation", async () => {
    const org = await orgOf("llm-all");
    for (const provider of LLM_PROVIDER_IDS) {
      await insertLlmCredential(db, { organizationId: org, provider });
    }
    const [row] = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${LLM_TABLE} WHERE organization_id = $1`,
      [org],
    );
    expect(Number(row?.n)).toBe(LLM_PROVIDER_IDS.length);
  });
});

describe("llm_provider_credentials : unicité", () => {
  it("UNIQUE (organization_id, provider) : un second identifiant du même fournisseur est refusé", async () => {
    const org = await orgOf("llm-unique");
    await insertLlmCredential(db, { organizationId: org, provider: "anthropic" });
    const error = await insertLlmCredential(db, {
      organizationId: org,
      provider: "anthropic",
    }).catch((e: unknown) => e);
    expect(sqlState(error)).toBe(UNIQUE);
    const unique = await db.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = '${LLM_TABLE}' AND indexdef LIKE '%UNIQUE%'`,
    );
    expect(unique.some((r) => /\(organization_id, provider\)/.test(r.indexdef))).toBe(true);
  });

  it("deux organisations peuvent chacune avoir un identifiant du même fournisseur", async () => {
    const a = await orgOf("llm-unique-a");
    const b = await orgOf("llm-unique-b");
    await insertLlmCredential(db, { organizationId: a, provider: "google" });
    await insertLlmCredential(db, { organizationId: b, provider: "google" });
  });

  it("remplacer une clé = UPDATE en place (nonce, chiffré, version)", async () => {
    const org = await orgOf("llm-replace");
    const id = await insertLlmCredential(db, { organizationId: org, provider: "openai" });
    await db.query(
      `UPDATE ${LLM_TABLE} SET ciphertext = $2, nonce = $3, key_version = 2, updated_at = now() WHERE id = $1`,
      [id, Buffer.alloc(60, 9), Buffer.alloc(12, 8)],
    );
    const [row] = await db.query<{ key_version: number }>(
      `SELECT key_version FROM ${LLM_TABLE} WHERE id = $1`,
      [id],
    );
    expect(row?.key_version).toBe(2);
  });
});

/** Insère dans une organisation neuve : renvoie l'erreur capturée, ou l'id si l'insertion réussit. */
const rejected = async (label: string, overrides: Record<string, unknown>) => {
  const org = await orgOf(label);
  return insertLlmCredential(db, { organizationId: org, ...overrides }).catch((e: unknown) => e);
};

describe("llm_provider_credentials : CHECK de valeurs", () => {
  it("nonce : exactement 12 octets", async () => {
    for (const size of [0, 11, 13, 16]) {
      expect(
        sqlState(await rejected(`nonce-${size}`, { nonce: Buffer.alloc(size) })),
        String(size),
      ).toBe(CHECK);
    }
    expect(sqlState(await rejected("nonce-12", { nonce: Buffer.alloc(12) }))).toBeUndefined();
  });

  it("key_version >= 1", async () => {
    for (const keyVersion of [0, -1]) {
      expect(sqlState(await rejected(`kv-${keyVersion}`, { keyVersion })), String(keyVersion)).toBe(
        CHECK,
      );
    }
    expect(sqlState(await rejected("kv-1", { keyVersion: 1 }))).toBeUndefined();
  });

  it("chiffré : plus long que le tag GCM (17 octets minimum), au plus 2064 octets", async () => {
    for (const size of [0, 1, 16]) {
      expect(
        sqlState(await rejected(`ct-low-${size}`, { ciphertext: Buffer.alloc(size, 1) })),
        String(size),
      ).toBe(CHECK);
    }
    expect(sqlState(await rejected("ct-2065", { ciphertext: Buffer.alloc(2065, 1) }))).toBe(CHECK);
    expect(sqlState(await rejected("ct-17", { ciphertext: Buffer.alloc(17, 1) }))).toBeUndefined();
    expect(
      sqlState(await rejected("ct-2064", { ciphertext: Buffer.alloc(2064, 1) })),
    ).toBeUndefined();
  });
});

describe("llm_provider_credentials : CHECK de default_model et NOT NULL", () => {
  it("default_model : NULL ou 1 à 100 caractères, sans '/' ni '..'", async () => {
    for (const defaultModel of ["", "x".repeat(101), "a/b", "a..b", "../etc"]) {
      expect(
        sqlState(
          await rejected(`dm-${defaultModel.length}-${defaultModel.slice(0, 3)}`, { defaultModel }),
        ),
        JSON.stringify(defaultModel.slice(0, 12)),
      ).toBe(CHECK);
    }
    for (const defaultModel of [null, "claude-sonnet-5-5", "x".repeat(100), "gpt-5.1"]) {
      const result = await rejected(`dm-ok-${defaultModel?.length ?? "null"}`, { defaultModel });
      expect(sqlState(result), String(defaultModel?.slice(0, 12))).toBeUndefined();
    }
  });

  it("NOT NULL : ciphertext, nonce, provider, organization_id", async () => {
    const org = await orgOf("llm-notnull");
    for (const column of ["ciphertext", "nonce"]) {
      const error = await db
        .query(
          `INSERT INTO ${LLM_TABLE} (id, organization_id, provider, ciphertext, nonce, created_at, updated_at)
           SELECT gen_random_uuid(), $1, 'anthropic',
                  ${column === "ciphertext" ? "NULL::bytea" : "'\\x00'::bytea"},
                  ${column === "nonce" ? "NULL::bytea" : "'\\x00'::bytea"}, now(), now()`,
          [org],
        )
        .catch((e: unknown) => e);
      expect(sqlState(error), column).toBe("23502");
    }
  });
});

describe("llm_provider_credentials : clé étrangère et cascade", () => {
  it("organization_id doit référencer une organisation existante", async () => {
    const error = await insertLlmCredential(db, {
      organizationId: "00000000-0000-4000-8000-000000000051",
    }).catch((e: unknown) => e);
    expect(sqlState(error)).toBe(FOREIGN_KEY);
  });

  it("created_by_user_id n'a pas de clé étrangère : l'utilisateur peut disparaître", async () => {
    const org = await orgOf("llm-nofk");
    const id = await insertLlmCredential(db, {
      organizationId: org,
      createdByUserId: "00000000-0000-4000-8000-000000000052",
    });
    expect(id).toBeDefined();
    const fks = await db.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE conrelid = '${LLM_TABLE}'::regclass AND contype = 'f'`,
    );
    expect(fks.map((f) => f.definition).join("\n")).not.toContain("created_by_user_id");
  });

  it("supprimer l'organisation supprime ses identifiants, sans toucher ceux des autres", async () => {
    const gone = await orgOf("llm-cascade-gone");
    const kept = await orgOf("llm-cascade-kept");
    await insertLlmCredential(db, { organizationId: gone, provider: "anthropic" });
    await insertLlmCredential(db, { organizationId: gone, provider: "openai" });
    const keptId = await insertLlmCredential(db, { organizationId: kept, provider: "anthropic" });

    await db.query("DELETE FROM organizations WHERE id = $1", [gone]);

    const left = await db.query<{ id: string }>(
      `SELECT id FROM ${LLM_TABLE} WHERE organization_id IN ($1, $2)`,
      [gone, kept],
    );
    expect(left.map((r) => r.id)).toEqual([keptId]);
  });
});

describe("llm_provider_credentials : aucune fuite en clair, AAD dérivée de la ligne", () => {
  const SENTINEL = "sk-ant-api03-SENTINELLE-KOKLO-51A-0123456789";
  const encrypt = (key: Buffer, aad: string) => {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from(aad));
    const body = Buffer.concat([cipher.update(SENTINEL, "utf8"), cipher.final()]);
    return { nonce, ciphertext: Buffer.concat([body, cipher.getAuthTag()]) };
  };
  const decrypt = (key: Buffer, row: { nonce: Buffer; ciphertext: Buffer }, aad: string) => {
    const decipher = createDecipheriv("aes-256-gcm", key, row.nonce);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(row.ciphertext.subarray(row.ciphertext.length - 16));
    return Buffer.concat([
      decipher.update(row.ciphertext.subarray(0, row.ciphertext.length - 16)),
      decipher.final(),
    ]).toString("utf8");
  };

  it("la ligne entière, rendue en texte, ne contient pas la clé en clair", async () => {
    const key = randomBytes(32);
    const org = await orgOf("llm-leak");
    const sealed = encrypt(key, aadOf(org, "anthropic"));
    await insertLlmCredential(db, { organizationId: org, ...sealed });
    const [row] = await db.query<{ dump: string }>(
      `SELECT t::text AS dump FROM ${LLM_TABLE} t WHERE organization_id = $1`,
      [org],
    );
    expect(row?.dump).not.toContain(SENTINEL);
    expect(row?.dump).not.toContain("SENTINELLE");
    expect(Buffer.from(row?.dump ?? "").includes(Buffer.from(SENTINEL))).toBe(false);
  });

  it("l'AAD llm:v1:<organization_id>:<provider> déchiffre ; une autre organisation ou un autre fournisseur échoue", async () => {
    const key = randomBytes(32);
    const org = await orgOf("llm-aad");
    const other = await orgOf("llm-aad-other");
    expect(aadOf(org, "anthropic")).toBe(`llm:v1:${org}:anthropic`);
    const sealed = encrypt(key, aadOf(org, "anthropic"));
    const id = await insertLlmCredential(db, { organizationId: org, ...sealed });
    const [row] = await db.query<{ ciphertext: Buffer; nonce: Buffer }>(
      `SELECT ciphertext, nonce FROM ${LLM_TABLE} WHERE id = $1`,
      [id],
    );
    const stored = row as { ciphertext: Buffer; nonce: Buffer };
    expect(decrypt(key, stored, aadOf(org, "anthropic"))).toBe(SENTINEL);
    expect(() => decrypt(key, stored, aadOf(other, "anthropic"))).toThrow();
    expect(() => decrypt(key, stored, aadOf(org, "openai"))).toThrow();
  });
});
