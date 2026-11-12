import { type LlmProviderId, revealLlmCredential } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  type CredentialCipher,
  type CredentialLookup,
  LlmCredentialResolver,
  LlmCredentialUnavailableError,
  llmCredentialAad,
  ResolverCredentialSource,
  type StoredCredential,
} from "../src/index.ts";

/**
 * TK-99a lot B : le résolveur de clés BYOK vit dans `@koklo/llm` (l'API et le worker le partagent). Mêmes
 * refus, même ordre, aucune valeur de clé dans une erreur.
 */
const ORG = "0198a000-0000-7000-8000-000000000001";
const SECRET = "sk-ant-clair-de-test-0123456789";

const stored = (over: Partial<StoredCredential> = {}): StoredCredential => ({
  id: "0198a000-0000-7000-8000-0000000000c1",
  secret: { ciphertext: Buffer.from("x"), nonce: Buffer.from("n"), keyVersion: 1 },
  defaultModel: "claude-test",
  baseUrl: null,
  invalidatedAt: null,
  revision: "abcdef",
  ...over,
});
const lookup = (row: StoredCredential | null): CredentialLookup => ({ find: async () => row });
const cipher = (seen: string[] = []): CredentialCipher => ({
  decrypt: (_secret, aad) => {
    seen.push(aad);
    return SECRET;
  },
});
const reason = async (work: Promise<unknown>) =>
  work.then(
    () => "résolu",
    (error: unknown) => (error instanceof LlmCredentialUnavailableError ? error.reason : "autre"),
  );

describe("llmCredentialAad", () => {
  it("lie la clé à l'organisation et au fournisseur", () => {
    expect(llmCredentialAad(ORG, "anthropic")).toBe(`llm:v1:${ORG}:anthropic`);
  });
});

describe("LlmCredentialResolver", () => {
  it("déchiffre avec l'AAD de l'organisation et rend la clé opaque", async () => {
    const aads: string[] = [];
    const resolved = await new LlmCredentialResolver(lookup(stored()), cipher(aads)).resolve(
      ORG,
      "anthropic",
    );
    expect(aads).toEqual([`llm:v1:${ORG}:anthropic`]);
    expect(revealLlmCredential(resolved.credential)).toBe(SECRET);
    expect(resolved).toMatchObject({ defaultModel: "claude-test", revision: "abcdef" });
    expect(JSON.stringify(resolved)).not.toContain(SECRET);
  });

  it("refuse dans l'ordre : absente, invalidée, sans porte-clés, illisible", async () => {
    const resolve = (row: StoredCredential | null, c: CredentialCipher | null) =>
      reason(new LlmCredentialResolver(lookup(row), c).resolve(ORG, "anthropic"));
    expect(await resolve(null, cipher())).toBe("missing");
    expect(await resolve(stored({ invalidatedAt: "2026-11-01T00:00:00.000Z" }), null)).toBe(
      "invalidated",
    );
    expect(await resolve(stored(), null)).toBe("no-encryption-key");
    const broken: CredentialCipher = {
      decrypt: () => {
        throw new Error(`octets ${SECRET}`);
      },
    };
    expect(await resolve(stored(), broken)).toBe("undecryptable");
  });
});

describe("ResolverCredentialSource", () => {
  const source = (row: StoredCredential | null) =>
    new ResolverCredentialSource(new LlmCredentialResolver(lookup(row), cipher()));

  it("rend « pas de clé » pour une clé absente ou invalidée", async () => {
    const provider: LlmProviderId = "anthropic";
    expect(await source(null).resolve(ORG, provider)).toBeUndefined();
    expect(
      await source(stored({ invalidatedAt: "2026-11-01T00:00:00.000Z" })).resolve(ORG, provider),
    ).toBeUndefined();
  });

  it("rejoue la garde anti-SSRF sur l'adresse de base", async () => {
    const row = stored({ baseUrl: "http://169.254.169.254/v1" });
    expect(await source(row).resolve(ORG, "openai_compatible")).toBeUndefined();
  });

  it("rend modèle et révision, jamais de propriété indéfinie", async () => {
    const found = await source(stored({ defaultModel: null })).resolve(ORG, "anthropic");
    expect(found).toBeDefined();
    expect(Object.keys(found ?? {}).sort()).toEqual(["credential", "revision"]);
  });
});
