import { LLM_PROVIDER_IDS } from "@koklo/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rotateEncryptionKey } from "../src/crypto/rotate-encryption-key.ts";
import { llmCredentialAad } from "../src/llm-credential/llm-credential-aad.ts";
import { PrismaLlmCredentialRepository } from "../src/llm-credential/prisma-llm-credential.repository.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";
import {
  createRotationHarness,
  K1,
  K2,
  type RotationHarness,
  ring,
  SETTINGS,
  V1,
} from "./helpers/rotation-world.ts";

/** TK-95 (lot C) : la rotation de la clé maître couvre les six fournisseurs et laisse `base_url` et les tables d'IA intacts. */
let h: RotationHarness;
beforeAll(async () => {
  h = await createRotationHarness();
}, 180_000);
afterAll(() => h?.dispose(), 60_000);

describe("rotation de la clé maître et fournisseurs d'IA", () => {
  it("rechiffre les clés des six fournisseurs (AAD par fournisseur), conserve base_url, ne touche pas aux réglages", async () => {
    await h.database.query("DELETE FROM llm_provider_credentials");
    const repository = new PrismaLlmCredentialRepository(h.service);
    const plain = new Map<string, string>();
    for (const provider of LLM_PROVIDER_IDS) {
      const secret = makeSentinel();
      plain.set(provider, secret);
      await repository.upsert(h.a.organizationId, {
        provider,
        secret: V1.encrypt(secret, llmCredentialAad(h.a.organizationId, provider)),
        defaultModel: null,
        baseUrl: provider === "openai_compatible" ? "https://llm.example.org/v1" : null,
        createdByUserId: null,
        at: "2026-01-01T00:00:00.000Z",
      });
    }
    await h.database.query(
      "INSERT INTO ai_organization_settings (organization_id, primary_provider, monthly_cap_micro_usd, created_at, updated_at) VALUES ($1, 'anthropic', 77, now(), now())",
      [h.a.organizationId],
    );
    await h.database.query(
      "INSERT INTO ai_usage_monthly (organization_id, month, provider, calls, created_at, updated_at) VALUES ($1, '2026-11-01', 'mistral', 9, now(), now())",
      [h.a.organizationId],
    );
    const aiBefore = await h.database.query("SELECT * FROM ai_organization_settings");

    const report = await rotateEncryptionKey(h.service, SETTINGS, {});
    expect(report.llm).toMatchObject({ scanned: 6, rotated: 6, failed: 0, conflicts: 0 });

    const rows = await h.database.query<{
      provider: string;
      ciphertext: Buffer;
      nonce: Buffer;
      key_version: number;
      base_url: string | null;
    }>(
      "SELECT provider::text AS provider, ciphertext, nonce, key_version, base_url FROM llm_provider_credentials",
    );
    expect(rows).toHaveLength(6);
    const cipher = ring([2, K2], [[1, K1]]);
    for (const row of rows) {
      expect(row.key_version).toBe(2);
      const secret = { ciphertext: row.ciphertext, nonce: row.nonce, keyVersion: row.key_version };
      const aad = llmCredentialAad(h.a.organizationId, row.provider as never);
      expect(cipher.decrypt(secret, aad)).toBe(plain.get(row.provider));
      expect(row.base_url).toBe(
        row.provider === "openai_compatible" ? "https://llm.example.org/v1" : null,
      );
    }
    expect(await h.database.query("SELECT * FROM ai_organization_settings")).toEqual(aiBefore);
    const [monthly] = await h.database.query<{ calls: number }>(
      "SELECT calls FROM ai_usage_monthly",
    );
    expect(monthly?.calls).toBe(9);
  });
});
