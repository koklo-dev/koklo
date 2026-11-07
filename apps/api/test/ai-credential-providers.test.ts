import { randomBytes } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import { LLM_PROVIDER_IDS, type LlmProviderId, revealLlmCredential } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaAiCredentialSource } from "../src/ai/prisma-ai-credential-source.ts";
import type { Clock } from "../src/clock.ts";
import { createKeyRing } from "../src/crypto/key-ring.ts";
import { DatabaseService } from "../src/database/database.module.ts";
import { LlmCredentialResolver } from "../src/llm-credential/llm-credential.resolver.ts";
import { LlmCredentialService } from "../src/llm-credential/llm-credential.service.ts";
import { llmCredentialAad } from "../src/llm-credential/llm-credential-aad.ts";
import { LlmCredentialInputError } from "../src/llm-credential/llm-credential-errors.ts";
import { PrismaLlmCredentialRepository } from "../src/llm-credential/prisma-llm-credential.repository.ts";
import { configFor, createSeededDatabase } from "./helpers/app.ts";
import { bytesOfRows, containsSecret, makeSentinel } from "./helpers/llm-credentials.ts";
import { createWorld, type World } from "./helpers/tickets.ts";

/**
 * TK-95 (lot C), sur base réelle : le service de clés couvre les six fournisseurs, `baseUrl` n'existe que
 * pour `openai_compatible` et passe la garde anti-SSRF dès l'enregistrement, le chiffrement reste lié à
 * (organisation, fournisseur), le retrait d'une clé détache le principal / le secours et efface ses usages.
 */
const ring = createKeyRing({ current: { version: 1, key: randomBytes(32) }, previous: [] });
const clock: Clock = { now: () => "2026-11-07T10:00:00.000Z" };
const URL_OK = "https://llm.example.org/v1";

let database: TestDatabase;
let databaseService: DatabaseService;
let service: LlmCredentialService;
let resolver: LlmCredentialResolver;
let source: PrismaAiCredentialSource;
let a: World;
let b: World;

beforeAll(async () => {
  database = await createSeededDatabase();
  a = await createWorld(database);
  b = await createWorld(database);
  databaseService = new DatabaseService(
    configFor({ databaseUrl: database.url, appVersion: "dev", appEnv: "test" }),
  );
  const repository = new PrismaLlmCredentialRepository(databaseService);
  service = new LlmCredentialService(repository, ring, clock);
  resolver = new LlmCredentialResolver(repository, ring);
  source = new PrismaAiCredentialSource(resolver);
}, 180_000);

afterAll(async () => {
  await databaseService?.onModuleDestroy();
  await database?.dispose();
}, 60_000);

beforeEach(async () => {
  await database.query("DELETE FROM ai_usage_monthly");
  await database.query("DELETE FROM ai_organization_settings");
  await database.query("DELETE FROM llm_provider_credentials");
});

const inputOf = (provider: LlmProviderId, apiKey: string) =>
  provider === "openai_compatible" ? { apiKey, baseUrl: URL_OK } : { apiKey };

const rejection = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (error) {
    return error;
  }
  return expect.unreachable("le service aurait dû refuser");
};

describe("les six fournisseurs", () => {
  it.each(LLM_PROVIDER_IDS)("%s : set, list, résolution, AAD par fournisseur", async (provider) => {
    const key = makeSentinel();
    const status = await service.set(a.organizationId, provider, inputOf(provider, key));
    expect(status.provider).toBe(provider);
    expect(status.baseUrl).toBe(provider === "openai_compatible" ? URL_OK : null);

    const resolved = await resolver.resolve(a.organizationId, provider);
    expect(revealLlmCredential(resolved.credential)).toBe(key);
    expect(resolved.baseUrl).toBe(provider === "openai_compatible" ? URL_OK : undefined);

    const rows = await database.query<Record<string, unknown>>(
      "SELECT * FROM llm_provider_credentials WHERE organization_id = $1 AND provider = $2::llm_provider",
      [a.organizationId, provider],
    );
    expect(rows).toHaveLength(1);
    expect(containsSecret(bytesOfRows(rows), key)).toBe(false);
    expect(llmCredentialAad(a.organizationId, provider)).toBe(
      `llm:v1:${a.organizationId}:${provider}`,
    );
  });

  it("une ligne copiée vers un autre fournisseur ou une autre organisation devient illisible", async () => {
    await service.set(a.organizationId, "mistral", { apiKey: makeSentinel() });
    await database.query(
      `INSERT INTO llm_provider_credentials (id, organization_id, provider, ciphertext, nonce, key_version, created_at, updated_at)
       SELECT gen_random_uuid(), organization_id, 'openrouter', ciphertext, nonce, key_version, now(), now()
       FROM llm_provider_credentials WHERE provider = 'mistral'`,
    );
    await expect(resolver.resolve(a.organizationId, "openrouter")).rejects.toMatchObject({
      reason: "undecryptable",
    });
  });
});

describe("baseUrl", () => {
  it("est obligatoire pour openai_compatible", async () => {
    const error = await rejection(
      service.set(a.organizationId, "openai_compatible", { apiKey: makeSentinel() }),
    );
    expect(error).toBeInstanceOf(LlmCredentialInputError);
    expect((error as LlmCredentialInputError).field).toBe("baseUrl");
  });

  it.each(LLM_PROVIDER_IDS.filter((p) => p !== "openai_compatible"))(
    "est refusée pour %s",
    async (provider) => {
      const error = await rejection(
        service.set(a.organizationId, provider, { apiKey: makeSentinel(), baseUrl: URL_OK }),
      );
      expect((error as LlmCredentialInputError).field).toBe("baseUrl");
    },
  );

  it.each([
    "http://llm.example.org/v1",
    "https://localhost/v1",
    "https://api.localhost/v1",
    "https://service.internal/v1",
    "https://10.0.0.5/v1",
    "https://192.168.1.10/v1",
    "https://127.0.0.1/v1",
    "https://169.254.169.254/latest",
    "https://[::1]/v1",
    "https://[::ffff:10.0.0.1]/v1",
    "https://2130706433/v1",
    "https://user:pass@llm.example.org/v1",
    "https://llm.example.org:8443/v1",
    "pas une adresse",
  ])("refuse %s dès l'enregistrement, sans rien écrire ni répéter l'adresse", async (baseUrl) => {
    const error = await rejection(
      service.set(a.organizationId, "openai_compatible", { apiKey: makeSentinel(), baseUrl }),
    );
    expect(error).toBeInstanceOf(LlmCredentialInputError);
    const text = `${(error as Error).message} ${(error as LlmCredentialInputError).reason}`;
    expect(text).not.toContain(baseUrl);
    expect(text.toLowerCase()).not.toContain("openai");
    const rows = await database.query("SELECT 1 FROM llm_provider_credentials");
    expect(rows).toHaveLength(0);
  });
});

describe("baseUrl : remplacement et garde à l'appel", () => {
  it("le remplacement de la clé remplace l'adresse ; une adresse n'est jamais copiée d'une organisation à l'autre", async () => {
    await service.set(a.organizationId, "openai_compatible", {
      apiKey: makeSentinel(),
      baseUrl: URL_OK,
    });
    await service.set(a.organizationId, "openai_compatible", {
      apiKey: makeSentinel(),
      baseUrl: "https://autre.example.org/v2",
    });
    expect((await resolver.resolve(a.organizationId, "openai_compatible")).baseUrl).toBe(
      "https://autre.example.org/v2",
    );
    expect(await service.list(b.organizationId)).toEqual([]);
  });

  it("une adresse devenue dangereuse en base est refusée à la résolution (garde à l'appel)", async () => {
    await service.set(a.organizationId, "openai_compatible", {
      apiKey: makeSentinel(),
      baseUrl: URL_OK,
    });
    await database.query("UPDATE llm_provider_credentials SET base_url = 'https://10.0.0.5/v1'");
    expect(await source.resolve(a.organizationId, "openai_compatible")).toBeUndefined();
  });
});

describe("PrismaAiCredentialSource", () => {
  it("rend la clé opaque, l'adresse et le modèle par défaut ; rien pour une clé absente ou invalidée", async () => {
    const key = makeSentinel();
    await service.set(a.organizationId, "mistral", { apiKey: key, defaultModel: "mistral-large" });
    const found = await source.resolve(a.organizationId, "mistral");
    expect(found?.defaultModel).toBe("mistral-large");
    expect(found?.baseUrl).toBeUndefined();
    expect(JSON.stringify(found)).not.toContain(key);
    expect(String(found?.credential)).not.toContain(key);

    expect(await source.resolve(a.organizationId, "google")).toBeUndefined();
    await service.invalidate(a.organizationId, "mistral");
    expect(await source.resolve(a.organizationId, "mistral")).toBeUndefined();
  });

  it("ne rend jamais la clé d'une autre organisation", async () => {
    await service.set(b.organizationId, "mistral", { apiKey: makeSentinel() });
    expect(await source.resolve(a.organizationId, "mistral")).toBeUndefined();
  });
});

const seedAi = async () => {
  await service.set(a.organizationId, "anthropic", { apiKey: makeSentinel() });
  await service.set(a.organizationId, "mistral", { apiKey: makeSentinel() });
  await service.set(a.organizationId, "openai", { apiKey: makeSentinel() });
  await database.query(
    `INSERT INTO ai_organization_settings (organization_id, primary_provider, fallback_provider, created_at, updated_at)
     VALUES ($1, 'anthropic', 'mistral', now(), now())`,
    [a.organizationId],
  );
  for (const provider of ["anthropic", "mistral"]) {
    await database.query(
      `INSERT INTO ai_usage_models (organization_id, usage, provider, model, created_at, updated_at)
       VALUES ($1, 'idea_space'::ai_usage, $2::llm_provider, 'm', now(), now())
       ON CONFLICT DO NOTHING`,
      [a.organizationId, provider],
    );
  }
  await database.query(
    `INSERT INTO ai_usage_monthly (organization_id, month, provider, calls, created_at, updated_at)
     VALUES ($1, '2026-11-01', 'mistral', 4, now(), now())`,
    [a.organizationId],
  );
};

describe("retrait d'une clé", () => {
  it("retirer le secours le détache des réglages, efface ses usages et garde l'historique de consommation", async () => {
    await seedAi();
    expect(await service.remove(a.organizationId, "mistral")).toBe(true);
    const [settings] = await database.query<Record<string, unknown>>(
      "SELECT primary_provider::text AS primary_provider, fallback_provider FROM ai_organization_settings",
    );
    expect(settings).toEqual({ primary_provider: "anthropic", fallback_provider: null });
    const usages = await database.query("SELECT 1 FROM ai_usage_models WHERE provider = 'mistral'");
    expect(usages).toHaveLength(0);
    const history = await database.query(
      "SELECT 1 FROM ai_usage_monthly WHERE provider = 'mistral'",
    );
    expect(history).toHaveLength(1);
  });

  it("retirer le principal le détache (le moteur retombe sur la seule clé ou Anthropic) au lieu d'échouer", async () => {
    await seedAi();
    expect(await service.remove(a.organizationId, "anthropic")).toBe(true);
    const [settings] = await database.query<Record<string, unknown>>(
      "SELECT primary_provider, fallback_provider::text AS fallback_provider FROM ai_organization_settings",
    );
    expect(settings).toEqual({ primary_provider: null, fallback_provider: "mistral" });
  });

  it("ne touche pas aux réglages d'une autre organisation", async () => {
    await seedAi();
    await service.set(b.organizationId, "anthropic", { apiKey: makeSentinel() });
    await database.query(
      "INSERT INTO ai_organization_settings (organization_id, primary_provider, created_at, updated_at) VALUES ($1, 'anthropic', now(), now())",
      [b.organizationId],
    );
    await service.remove(a.organizationId, "anthropic");
    const [other] = await database.query<{ primary_provider: string }>(
      "SELECT primary_provider::text AS primary_provider FROM ai_organization_settings WHERE organization_id = $1",
      [b.organizationId],
    );
    expect(other?.primary_provider).toBe("anthropic");
  });
});
