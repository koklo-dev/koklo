import { contract, generateOpenApi } from "@koklo/contract";
import { LLM_PROVIDER_IDS } from "@koklo/domain";
import { describe, expect, it } from "vitest";

/**
 * TK-52b : le fournisseur du contrat (chemin et statut) liste exactement `LLM_PROVIDER_IDS` du
 * domaine, ni plus (le faux `fake` est refusé) ni moins. Le contrat ne dépend pas du domaine :
 * la parité vit dans l'api, qui voit les deux.
 */
type Standard = { "~standard": { validate(v: unknown): unknown } };
type Proc = { "~orpc": { inputSchemas?: Standard[]; outputSchemas?: Standard[] } };
const group = () => (contract as unknown as Record<string, Record<string, Proc>>).llmCredential;
const accepts = (schema: Standard | undefined, value: unknown) =>
  schema !== undefined &&
  (schema["~standard"].validate(value) as { issues?: unknown[] }).issues === undefined;

const KEY = "FAKE-KEY-NOT-REAL-0123456789";
const INSTANT = "2026-11-02T10:00:00.000Z";

describe("parité des fournisseurs avec LLM_PROVIDER_IDS", () => {
  it("le groupe existe", () => {
    expect(group()).toBeDefined();
  });

  it.each(["set", "remove", "invalidate"])(
    "%s : accepte chaque identifiant du domaine, refuse le reste",
    (name) => {
      const schema = group()?.[name]?.["~orpc"].inputSchemas?.[0];
      for (const provider of LLM_PROVIDER_IDS) {
        expect(accepts(schema, { provider, apiKey: KEY }), provider).toBe(true);
      }
      for (const provider of ["fake", "", "Anthropic", "mistral"]) {
        expect(accepts(schema, { provider, apiKey: KEY }), provider).toBe(false);
      }
    },
  );

  it("le statut accepte chaque identifiant du domaine et refuse fake", () => {
    const schema = group()?.set?.["~orpc"].outputSchemas?.[0];
    const base = { configured: true, invalid: false, createdAt: INSTANT, updatedAt: INSTANT };
    for (const provider of LLM_PROVIDER_IDS) {
      expect(accepts(schema, { ...base, provider }), provider).toBe(true);
    }
    expect(accepts(schema, { ...base, provider: "fake" })).toBe(false);
  });

  it("l'OpenAPI énumère exactement les identifiants du domaine pour le paramètre de chemin", async () => {
    const doc = (await generateOpenApi()) as unknown as {
      paths: Record<
        string,
        Record<string, { parameters?: { name: string; schema?: { enum?: string[] } }[] }>
      >;
    };
    for (const [path, method] of [
      ["/llm-credentials/{provider}", "put"],
      ["/llm-credentials/{provider}", "delete"],
      ["/llm-credentials/{provider}/invalidate", "post"],
    ] as const) {
      const parameter = doc.paths[path]?.[method]?.parameters?.find((p) => p.name === "provider");
      expect([...(parameter?.schema?.enum ?? [])].sort(), `${method} ${path}`).toEqual(
        [...LLM_PROVIDER_IDS].sort(),
      );
    }
  });
});
