import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import type { TestDatabase } from "@koklo/db/testing";
import * as Sentry from "@sentry/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createKeyRing } from "../src/crypto/key-ring.ts";
import { DatabaseService } from "../src/database/database.module.ts";
import { LlmCredentialService } from "../src/llm-credential/llm-credential.service.ts";
import { LlmCredentialStoreError } from "../src/llm-credential/llm-credential-errors.ts";
import { PrismaLlmCredentialRepository } from "../src/llm-credential/prisma-llm-credential.repository.ts";
import { guard, type InternalErrors } from "../src/request-context.ts";
import { configFor, createSeededDatabase, UNREACHABLE_DATABASE_URL } from "./helpers/app.ts";
import { containsSecret, makeSentinel } from "./helpers/llm-credentials.ts";
import { createWorld, type World } from "./helpers/tickets.ts";

vi.mock("@sentry/node", () => ({ init: vi.fn(), captureException: vi.fn() }));

/**
 * TK-52a NON-FUITE : une erreur de la base (CHECK violé : « Failing row contains (… \x… ) »)
 * est réécrite en `LlmCredentialStoreError` SANS cause ni `meta` ; ni elle, ni ce que reçoit
 * Sentry (`guard` -> `captureError`), ni les journaux ne contiennent la clé ou le chiffré.
 * Le Red force la violation en appelant le dépôt directement (hors validation du service).
 */
const key = randomBytes(32);
const cipher = createKeyRing({ current: { version: 1, key }, previous: [] });
const AAD = "llm:v1:test:anthropic";
const errors: InternalErrors = {
  INTERNAL: ({ data }) => Object.assign(new Error("INTERNAL"), { data }),
};

let database: TestDatabase;
let databaseService: DatabaseService;
let repository: PrismaLlmCredentialRepository;
let unreachable: DatabaseService;
let offline: PrismaLlmCredentialRepository;
let a: World;
const secret = makeSentinel();
const written: string[] = [];

beforeAll(async () => {
  database = await createSeededDatabase();
  a = await createWorld(database);
  databaseService = new DatabaseService(
    configFor({ databaseUrl: database.url, appVersion: "dev", appEnv: "test" }),
  );
  repository = new PrismaLlmCredentialRepository(databaseService);
  unreachable = new DatabaseService(
    configFor({ databaseUrl: UNREACHABLE_DATABASE_URL, appVersion: "dev", appEnv: "test" }),
  );
  offline = new PrismaLlmCredentialRepository(unreachable);
}, 180_000);

afterAll(async () => {
  await databaseService?.onModuleDestroy();
  await unreachable?.onModuleDestroy();
  await database?.dispose();
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  written.length = 0;
  for (const stream of [process.stdout, process.stderr]) {
    vi.spyOn(stream, "write").mockImplementation(((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    }) as typeof stream.write);
  }
});

const at = "2026-11-01T10:00:00.000Z";
const input = (over: { defaultModel?: string | null; nonce?: Buffer } = {}) => {
  const secretValue = cipher.encrypt(secret, AAD);
  return {
    provider: "anthropic" as const,
    secret: over.nonce ? { ...secretValue, nonce: over.nonce } : secretValue,
    defaultModel: over.defaultModel === undefined ? null : over.defaultModel,
    createdByUserId: null,
    at,
  };
};

async function failure(run: () => Promise<unknown>): Promise<LlmCredentialStoreError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(LlmCredentialStoreError);
    return error as LlmCredentialStoreError;
  }
  return expect.unreachable("le dépôt aurait dû échouer");
}

function expectClean(error: unknown, forbidden: string[] = []) {
  const err = error as Error;
  expect("cause" in err).toBe(false);
  expect("meta" in err).toBe(false);
  expect("code" in err).toBe(false);
  const text = [err.message, err.stack ?? "", inspect(err, { depth: 6 }), JSON.stringify(err)].join(
    "\n",
  );
  expect(text).not.toMatch(/Failing row/i);
  expect(text).not.toContain("\\x");
  expect(text).not.toMatch(/llm_provider_credentials_\w+_check/);
  expect(containsSecret(text, secret)).toBe(false);
  for (const value of forbidden) expect(text).not.toContain(value);
}

describe("erreur Prisma du dépôt : réécrite sans cause ni meta", () => {
  it("CHECK du modèle par défaut violé", async () => {
    const error = await failure(() =>
      repository.upsert(a.organizationId, input({ defaultModel: "mauvais/modele" })),
    );
    expectClean(error, [input().secret.ciphertext.toString("hex")]);
  });

  it("CHECK du nonce violé (Failing row contains … \\x…)", async () => {
    const bad = input({ nonce: Buffer.alloc(5, 1) });
    const error = await failure(() => repository.upsert(a.organizationId, bad));
    expectClean(error, [bad.secret.ciphertext.toString("hex")]);
    expect(
      await database.query("SELECT 1 FROM llm_provider_credentials WHERE organization_id = $1", [
        a.organizationId,
      ]),
    ).toHaveLength(0);
  });

  it("base injoignable : toutes les opérations rejettent LlmCredentialStoreError sans hôte ni mot de passe", async () => {
    const operations = [
      () => offline.upsert(a.organizationId, input()),
      () => offline.list(a.organizationId),
      () => offline.find(a.organizationId, "anthropic"),
      () => offline.remove(a.organizationId, "anthropic"),
      () => offline.invalidate(a.organizationId, "anthropic", at),
      () => offline.markUsed(a.organizationId, "anthropic", at),
    ];
    for (const operation of operations) {
      expectClean(await failure(operation), ["127.0.0.1", "secret-pw", "koklo"]);
    }
  });

  it("le service laisse passer LlmCredentialStoreError tel quel", async () => {
    const service = new LlmCredentialService(offline, cipher);
    await failure(() => service.set(a.organizationId, "anthropic", { apiKey: secret }));
    await failure(() => service.list(a.organizationId));
  });
});

describe("Sentry et journaux", () => {
  it("guard transmet à Sentry l'erreur réécrite : ni clé, ni chiffré, ni ligne fautive", async () => {
    const bad = input({ nonce: Buffer.alloc(5, 1) });
    await expect(
      guard("req-52", errors, () => repository.upsert(a.organizationId, bad)),
    ).rejects.toMatchObject({ data: { requestId: "req-52" } });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [captured, context] = vi.mocked(Sentry.captureException).mock.calls[0] ?? [];
    expect(captured).toBeInstanceOf(LlmCredentialStoreError);
    expectClean(captured, [bad.secret.ciphertext.toString("hex")]);
    expect(containsSecret(inspect(context, { depth: 6 }), secret)).toBe(false);
  });

  it("set réussi puis échecs : la clé n'apparaît dans aucune sortie standard ni dans Sentry", async () => {
    const service = new LlmCredentialService(repository, cipher);
    await service.set(a.organizationId, "anthropic", { apiKey: secret });
    await guard("req-1", errors, () =>
      service.set(a.organizationId, "anthropic", { apiKey: secret, defaultModel: "x/y" }),
    ).catch(() => undefined);
    await guard("req-2", errors, () =>
      new LlmCredentialService(offline, cipher).set(a.organizationId, "openai", { apiKey: secret }),
    ).catch(() => undefined);
    expect(containsSecret(written.join("\n"), secret)).toBe(false);
    for (const call of vi.mocked(Sentry.captureException).mock.calls) {
      expect(containsSecret(inspect(call, { depth: 8 }), secret)).toBe(false);
    }
  });
});
