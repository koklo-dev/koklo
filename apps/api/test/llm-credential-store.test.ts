import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import type { TestDatabase } from "@koklo/db/testing";
import { isLlmCredential, revealLlmCredential } from "@koklo/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Clock } from "../src/clock.ts";
import { createKeyRing } from "../src/crypto/key-ring.ts";
import { DatabaseService } from "../src/database/database.module.ts";
import { LlmCredentialResolver } from "../src/llm-credential/llm-credential.resolver.ts";
import { LlmCredentialService } from "../src/llm-credential/llm-credential.service.ts";
import { llmCredentialAad } from "../src/llm-credential/llm-credential-aad.ts";
import {
  EncryptionUnavailableError,
  LlmCredentialInputError,
  LlmCredentialUnavailableError,
} from "../src/llm-credential/llm-credential-errors.ts";
import { PrismaLlmCredentialRepository } from "../src/llm-credential/prisma-llm-credential.repository.ts";
import { configFor, createSeededDatabase } from "./helpers/app.ts";
import { bytesOfRows, containsSecret, makeSentinel } from "./helpers/llm-credentials.ts";
import { createWorld, type World } from "./helpers/tickets.ts";

/**
 * TK-52a, sur base réelle. CRITÈRE 1 du sprint : « la base ne contient jamais la clé en clair ».
 * Isolation par organisation, AAD (copie d'une ligne = illisible), remplacement, statut sans clé,
 * résolveur (`LlmCredential` opaque + modèle par défaut, quatre refus typés).
 */
const k1 = randomBytes(32);
const k2 = randomBytes(32);
const ring = (version = 1, key = k1, previous: Array<[number, Buffer]> = []) =>
  createKeyRing({
    current: { version, key },
    previous: previous.map(([v, k]) => ({ version: v, key: k })),
  });

let database: TestDatabase;
let databaseService: DatabaseService;
let repository: PrismaLlmCredentialRepository;
let a: World;
let b: World;
let now = Date.parse("2026-11-01T10:00:00.000Z");
const clock: Clock = { now: () => new Date(now).toISOString() };
const tick = (ms: number) => {
  now += ms;
};

let service: LlmCredentialService;
let resolver: LlmCredentialResolver;

beforeAll(async () => {
  database = await createSeededDatabase();
  a = await createWorld(database);
  b = await createWorld(database);
  databaseService = new DatabaseService(
    configFor({ databaseUrl: database.url, appVersion: "dev", appEnv: "test" }),
  );
  repository = new PrismaLlmCredentialRepository(databaseService);
  service = new LlmCredentialService(repository, ring(), clock);
  resolver = new LlmCredentialResolver(repository, ring());
}, 180_000);

afterAll(async () => {
  await databaseService?.onModuleDestroy();
  await database?.dispose();
}, 60_000);

const rowsOf = (organizationId: string) =>
  database.query<Record<string, unknown>>(
    "SELECT * FROM llm_provider_credentials WHERE organization_id = $1 ORDER BY provider",
    [organizationId],
  );
const one = <T>(rows: readonly T[]): T => {
  const [row] = rows;
  if (row === undefined) throw new Error("ligne attendue");
  return row;
};
const buf = (row: Record<string, unknown>, column: string) => row[column] as Buffer;
const clearAll = () => database.query("DELETE FROM llm_provider_credentials");
const unavailable = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LlmCredentialUnavailableError);
    return (error as LlmCredentialUnavailableError).reason;
  }
  return expect.unreachable("resolve aurait dû refuser");
};

describe("CRITÈRE 1 : la base ne contient jamais la clé en clair", () => {
  it("après set, ni la ligne brute ni le dump de la table ne contiennent la clé (utf8, base64, hex)", async () => {
    await clearAll();
    const secret = makeSentinel();
    await service.set(a.organizationId, "anthropic", { apiKey: secret, defaultModel: "modele-x" });
    await service.set(a.organizationId, "openai", { apiKey: secret });

    const all = await database.query<Record<string, unknown>>(
      "SELECT * FROM llm_provider_credentials",
    );
    expect(all).toHaveLength(2);
    expect(containsSecret(bytesOfRows(all), secret)).toBe(false);
    const dump = await database.query<Record<string, unknown>>(
      "SELECT t::text AS dump, encode(t.ciphertext, 'hex') AS hex, encode(t.ciphertext, 'base64') AS b64 FROM llm_provider_credentials t",
    );
    expect(containsSecret(bytesOfRows(dump), secret)).toBe(false);
    // Aucune autre table ne reçoit la clé non plus (journal d'audit compris).
    const audit = await database.query<Record<string, unknown>>("SELECT t::text FROM audit_log t");
    expect(containsSecret(bytesOfRows(audit), secret)).toBe(false);
  });

  it("le chiffré diffère du clair, tient dans les CHECK et porte la version du porte-clés", async () => {
    await clearAll();
    const secret = makeSentinel();
    await service.set(a.organizationId, "anthropic", { apiKey: secret });
    const row = one(await rowsOf(a.organizationId));
    expect(buf(row, "ciphertext").length).toBe(Buffer.byteLength(secret) + 16);
    expect(buf(row, "nonce").length).toBe(12);
    expect(row.key_version).toBe(1);
    expect(containsSecret(buf(row, "ciphertext"), secret)).toBe(false);
  });

  it("l'AAD n'est stockée nulle part", async () => {
    await clearAll();
    await service.set(a.organizationId, "anthropic", { apiKey: makeSentinel() });
    const aad = llmCredentialAad(a.organizationId, "anthropic");
    const [row] = await database.query<Record<string, unknown>>(
      "SELECT t::text AS dump FROM llm_provider_credentials t",
    );
    expect(String(row?.dump)).not.toContain("llm:v1");
    expect(String(row?.dump)).not.toContain(aad);
  });
});

describe("set : création et remplacement", () => {
  it("crée une ligne et rend un statut sans aucune valeur dérivée de la clé", async () => {
    await clearAll();
    const secret = makeSentinel();
    const status = await service.set(a.organizationId, "anthropic", {
      apiKey: secret,
      defaultModel: "modele-x",
      createdByUserId: a.actors.owner.userId,
    });
    expect(Object.keys(status).sort()).toEqual(
      [
        "createdAt",
        "defaultModel",
        "id",
        "invalid",
        "invalidatedAt",
        "lastUsedAt",
        "provider",
        "updatedAt",
      ].sort(),
    );
    expect(status).toMatchObject({
      provider: "anthropic",
      defaultModel: "modele-x",
      invalid: false,
      invalidatedAt: null,
      lastUsedAt: null,
    });
    expect(containsSecret(JSON.stringify(status), secret)).toBe(false);
  });
});

describe("set : remplacement", () => {
  it("remplace en place : une ligne, même id, nouveau nonce, nouveau chiffré, ré-armement", async () => {
    await clearAll();
    const first = makeSentinel();
    const created = await service.set(a.organizationId, "anthropic", {
      apiKey: first,
      defaultModel: "modele-x",
    });
    const before = one(await rowsOf(a.organizationId));
    await service.invalidate(a.organizationId, "anthropic");
    await service.markUsed(a.organizationId, "anthropic");
    tick(5000);

    const second = makeSentinel();
    const replaced = await service.set(a.organizationId, "anthropic", { apiKey: second });
    const after = await rowsOf(a.organizationId);
    expect(after).toHaveLength(1);
    expect(replaced.id).toBe(created.id);
    expect(replaced.createdAt).toBe(created.createdAt);
    expect(replaced).toMatchObject({ invalid: false, invalidatedAt: null, lastUsedAt: null });
    // PUT : le modèle par défaut non fourni est effacé.
    expect(replaced.defaultModel).toBeNull();
    expect(buf(one(after), "nonce").equals(buf(before, "nonce"))).toBe(false);
    expect(buf(one(after), "ciphertext").equals(buf(before, "ciphertext"))).toBe(false);
    // L'ancien chiffré a disparu et rien ne contient l'une ou l'autre clé.
    const dump = bytesOfRows(await database.query("SELECT * FROM llm_provider_credentials"));
    expect(containsSecret(dump, first)).toBe(false);
    expect(containsSecret(dump, second)).toBe(false);
    expect(
      revealLlmCredential((await resolver.resolve(a.organizationId, "anthropic")).credential),
    ).toBe(second);
  });

  it("même clé redéposée deux fois : nonces distincts", async () => {
    await clearAll();
    const secret = makeSentinel();
    await service.set(a.organizationId, "google", { apiKey: secret });
    const first = one(await rowsOf(a.organizationId));
    await service.set(a.organizationId, "google", { apiKey: secret });
    const second = one(await rowsOf(a.organizationId));
    expect(buf(first, "nonce").equals(buf(second, "nonce"))).toBe(false);
  });
});

describe("set sans porte-clés", () => {
  it("EncryptionUnavailableError et rien d'écrit ; list et remove fonctionnent", async () => {
    await clearAll();
    const bare = new LlmCredentialService(repository, null, clock);
    await expect(
      bare.set(a.organizationId, "anthropic", { apiKey: makeSentinel() }),
    ).rejects.toBeInstanceOf(EncryptionUnavailableError);
    expect(await rowsOf(a.organizationId)).toHaveLength(0);
    await service.set(a.organizationId, "anthropic", { apiKey: makeSentinel() });
    expect(await bare.list(a.organizationId)).toHaveLength(1);
    expect(await bare.invalidate(a.organizationId, "anthropic")).not.toBeNull();
    expect(await bare.remove(a.organizationId, "anthropic")).toBe(true);
  });
});

describe("validation de l'entrée : identique aux CHECK SQL", () => {
  const set = (apiKey: string, defaultModel?: string) =>
    service.set(a.organizationId, "anthropic", {
      apiKey,
      ...(defaultModel === undefined ? {} : { defaultModel }),
    });

  it("clé de 512 caractères acceptée (y compris multi-octets) et relue à l'identique", async () => {
    await clearAll();
    for (const key of ["k".repeat(512), "€".repeat(512)]) {
      await set(key);
      const resolved = await resolver.resolve(a.organizationId, "anthropic");
      expect(revealLlmCredential(resolved.credential)).toBe(key);
    }
  });

  it.each([
    ["vide", ""],
    ["blancs", "   "],
    ["513 caractères", "k".repeat(513)],
    ["caractère de contrôle", `${makeSentinel()}\u0007`],
    ["saut de ligne", `${makeSentinel()}\n`],
  ])("clé %s : LlmCredentialInputError(apiKey), sans la valeur, rien d'écrit", async (_l, key) => {
    await clearAll();
    try {
      await set(key);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(LlmCredentialInputError);
      expect((error as LlmCredentialInputError).field).toBe("apiKey");
      const text = `${(error as Error).message} ${inspect(error, { depth: 5 })}`;
      expect(text).not.toContain(key.trim() === "" ? "\u0000-never" : key.slice(0, 20));
    }
    expect(await rowsOf(a.organizationId)).toHaveLength(0);
  });

  it("defaultModel : 1 à 100 points de code, sans `/` ni `..`", async () => {
    await clearAll();
    for (const model of ["m", "x".repeat(100), "😀".repeat(100), "claude-x.1"]) {
      expect((await set(makeSentinel(), model)).defaultModel).toBe(model);
    }
    for (const bad of ["", "x".repeat(101), "😀".repeat(101), "a/b", "a..b", "..", "/"]) {
      await expect(set(makeSentinel(), bad)).rejects.toMatchObject({
        name: "LlmCredentialInputError",
        field: "defaultModel",
      });
    }
  });
});

describe("list, remove, invalidate, markUsed", () => {
  it("list : un statut par fournisseur configuré, sans clé, trié, vide pour une autre organisation", async () => {
    await clearAll();
    const secret = makeSentinel();
    await service.set(a.organizationId, "openai", { apiKey: secret });
    await service.set(a.organizationId, "anthropic", { apiKey: secret });
    const items = await service.list(a.organizationId);
    expect(items.map((item) => item.provider)).toEqual(["anthropic", "openai"]);
    expect(containsSecret(JSON.stringify(items), secret)).toBe(false);
    expect(JSON.stringify(items)).not.toMatch(/ciphertext|nonce|keyVersion/);
    expect(await service.list(b.organizationId)).toEqual([]);
  });

  it("invalidate : marque sans supprimer, idempotent ; absent : null", async () => {
    await clearAll();
    await service.set(a.organizationId, "anthropic", { apiKey: makeSentinel() });
    tick(1000);
    const first = await service.invalidate(a.organizationId, "anthropic");
    expect(first).toMatchObject({ invalid: true, invalidatedAt: clock.now() });
    tick(60_000);
    const again = await service.invalidate(a.organizationId, "anthropic");
    expect(again?.invalidatedAt).toBe(first?.invalidatedAt);
    expect(await rowsOf(a.organizationId)).toHaveLength(1);
    expect(await service.invalidate(a.organizationId, "google")).toBeNull();
  });

  it("remove : supprime physiquement ; absent : false", async () => {
    await clearAll();
    await service.set(a.organizationId, "anthropic", { apiKey: makeSentinel() });
    expect(await service.remove(a.organizationId, "anthropic")).toBe(true);
    expect(await rowsOf(a.organizationId)).toHaveLength(0);
    expect(await service.remove(a.organizationId, "anthropic")).toBe(false);
  });

  it("markUsed : au plus une écriture par minute", async () => {
    await clearAll();
    await service.set(a.organizationId, "anthropic", { apiKey: makeSentinel() });
    const lastUsed = async () => (await service.list(a.organizationId))[0]?.lastUsedAt;
    expect(await lastUsed()).toBeNull();
    await service.markUsed(a.organizationId, "anthropic");
    const first = await lastUsed();
    expect(first).toBe(clock.now());
    tick(59_000);
    await service.markUsed(a.organizationId, "anthropic");
    expect(await lastUsed()).toBe(first);
    tick(2000);
    await service.markUsed(a.organizationId, "anthropic");
    expect(await lastUsed()).toBe(clock.now());
  });

  it("markUsed sur une clé absente : sans effet ni erreur", async () => {
    await clearAll();
    await expect(service.markUsed(a.organizationId, "google")).resolves.toBeUndefined();
  });
});

describe("isolation entre organisations", () => {
  it("chacune ne voit, ne résout, n'invalide et ne supprime que ses clés", async () => {
    await clearAll();
    const keyA = makeSentinel();
    const keyB = makeSentinel();
    await service.set(a.organizationId, "anthropic", { apiKey: keyA });
    expect(await unavailable(resolver.resolve(b.organizationId, "anthropic"))).toBe("missing");
    expect(await service.invalidate(b.organizationId, "anthropic")).toBeNull();
    expect(await service.remove(b.organizationId, "anthropic")).toBe(false);
    await service.set(b.organizationId, "anthropic", { apiKey: keyB });

    const resolvedA = await resolver.resolve(a.organizationId, "anthropic");
    const resolvedB = await resolver.resolve(b.organizationId, "anthropic");
    expect(revealLlmCredential(resolvedA.credential)).toBe(keyA);
    expect(revealLlmCredential(resolvedB.credential)).toBe(keyB);
    expect((await service.list(a.organizationId))[0]?.invalid).toBe(false);
  });
});

describe("AAD : une ligne copiée ailleurs est illisible", () => {
  it("copie vers une autre organisation : undecryptable", async () => {
    await clearAll();
    await service.set(a.organizationId, "anthropic", { apiKey: makeSentinel() });
    await database.query(
      `INSERT INTO llm_provider_credentials (id, organization_id, provider, ciphertext, nonce, key_version)
       SELECT gen_random_uuid(), $2, provider, ciphertext, nonce, key_version
       FROM llm_provider_credentials WHERE organization_id = $1`,
      [a.organizationId, b.organizationId],
    );
    expect(await unavailable(resolver.resolve(b.organizationId, "anthropic"))).toBe(
      "undecryptable",
    );
    await expect(resolver.resolve(a.organizationId, "anthropic")).resolves.toBeDefined();
  });

  it("copie vers un autre fournisseur : undecryptable", async () => {
    await clearAll();
    await service.set(a.organizationId, "anthropic", { apiKey: makeSentinel() });
    await database.query(
      `INSERT INTO llm_provider_credentials (id, organization_id, provider, ciphertext, nonce, key_version)
       SELECT gen_random_uuid(), organization_id, 'openai'::llm_provider, ciphertext, nonce, key_version
       FROM llm_provider_credentials WHERE organization_id = $1`,
      [a.organizationId],
    );
    expect(await unavailable(resolver.resolve(a.organizationId, "openai"))).toBe("undecryptable");
  });
});

describe("LlmCredentialResolver : refus typés", () => {
  it("rend un LlmCredential opaque et le modèle par défaut", async () => {
    await clearAll();
    const secret = makeSentinel();
    await service.set(a.organizationId, "anthropic", { apiKey: secret, defaultModel: "modele-x" });
    const { credential, defaultModel } = await resolver.resolve(a.organizationId, "anthropic");
    expect(isLlmCredential(credential)).toBe(true);
    expect(defaultModel).toBe("modele-x");
    expect(revealLlmCredential(credential)).toBe(secret);
    for (const rendered of [
      String(credential),
      JSON.stringify({ credential }),
      inspect(credential, { depth: 5 }),
      `${credential}`,
    ]) {
      expect(rendered).not.toContain(secret.slice(0, 16));
      expect(rendered).toContain("[redacted]");
    }
  });

  it("sans modèle par défaut : undefined", async () => {
    await clearAll();
    await service.set(a.organizationId, "anthropic", { apiKey: makeSentinel() });
    expect((await resolver.resolve(a.organizationId, "anthropic")).defaultModel).toBeUndefined();
  });

  it("absente : missing", async () => {
    await clearAll();
    expect(await unavailable(resolver.resolve(a.organizationId, "anthropic"))).toBe("missing");
  });

  it("invalidée : invalidated, puis lisible de nouveau après un nouveau set", async () => {
    await clearAll();
    await service.set(a.organizationId, "anthropic", { apiKey: makeSentinel() });
    await service.invalidate(a.organizationId, "anthropic");
    expect(await unavailable(resolver.resolve(a.organizationId, "anthropic"))).toBe("invalidated");
    await service.set(a.organizationId, "anthropic", { apiKey: makeSentinel() });
    await expect(resolver.resolve(a.organizationId, "anthropic")).resolves.toBeDefined();
  });

  it("sans porte-clés : no-encryption-key (mais missing reste missing)", async () => {
    await clearAll();
    const bare = new LlmCredentialResolver(repository, null);
    expect(await unavailable(bare.resolve(a.organizationId, "anthropic"))).toBe("missing");
    await service.set(a.organizationId, "anthropic", { apiKey: makeSentinel() });
    expect(await unavailable(bare.resolve(a.organizationId, "anthropic"))).toBe(
      "no-encryption-key",
    );
  });
});

describe("LlmCredentialResolver : illisible et rotation", () => {
  it("chiffré altéré, version inconnue ou autre clé maître : undecryptable", async () => {
    await clearAll();
    await service.set(a.organizationId, "anthropic", { apiKey: makeSentinel() });
    expect(
      await unavailable(
        new LlmCredentialResolver(repository, ring(1, k2)).resolve(a.organizationId, "anthropic"),
      ),
    ).toBe("undecryptable");
    await database.query("UPDATE llm_provider_credentials SET key_version = 9");
    expect(await unavailable(resolver.resolve(a.organizationId, "anthropic"))).toBe(
      "undecryptable",
    );
    await database.query(
      "UPDATE llm_provider_credentials SET key_version = 1, ciphertext = set_byte(ciphertext, 0, get_byte(ciphertext, 0) # 255)",
    );
    expect(await unavailable(resolver.resolve(a.organizationId, "anthropic"))).toBe(
      "undecryptable",
    );
  });

  it("rotation en mémoire : une ligne en v1 reste lisible avec la v1 en précédente", async () => {
    await clearAll();
    const secret = makeSentinel();
    await service.set(a.organizationId, "anthropic", { apiKey: secret });
    const rotated = new LlmCredentialResolver(repository, ring(2, k2, [[1, k1]]));
    const resolved = await rotated.resolve(a.organizationId, "anthropic");
    expect(revealLlmCredential(resolved.credential)).toBe(secret);
    // Une écriture après rotation passe en v2, toujours sans clair en base.
    const rotatedService = new LlmCredentialService(repository, ring(2, k2, [[1, k1]]), clock);
    await rotatedService.set(a.organizationId, "anthropic", { apiKey: secret });
    expect((await rowsOf(a.organizationId))[0]?.key_version).toBe(2);
    expect(containsSecret(bytesOfRows(await rowsOf(a.organizationId)), secret)).toBe(false);
  });

  it("les messages d'erreur ne contiennent ni clé ni organisation", async () => {
    await clearAll();
    try {
      await resolver.resolve(a.organizationId, "anthropic");
      expect.unreachable();
    } catch (error) {
      expect(`${(error as Error).message}${(error as Error).stack}`).not.toContain(
        a.organizationId,
      );
    }
  });
});
