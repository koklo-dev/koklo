import { LLM_PROVIDER_IDS, type LlmProviderId } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { providerFor, requestFor, scripted } from "./support/sdk-bench.ts";
import { cutResponse, FORMAT_OF, SERVED, USAGE } from "./support/sdk-bodies.ts";

const each = LLM_PROVIDER_IDS.map((id) => [id] as [LlmProviderId]);

/**
 * TK-115b (B844) : une réponse coupée par le plafond de jetons n'est ni une sortie invalide ni une panne : elle dit
 * « max-tokens », sans sortie, avec la consommation à compter.
 */
describe.each(each)("adaptateur SDK %s : réponse coupée", (id) => {
  it.each([
    ["texte JSON coupé", '{"proposals":[{"kind":"sta'],
    ["texte vide", ""],
  ])("arrêt « length » (%s) : réponse max-tokens sans sortie, usage rendu", async (_n, text) => {
    const t = scripted(() => cutResponse(FORMAT_OF[id], text));
    const request = requestFor(id, { output: { kind: "json", schema: { type: "object" } } });
    const response = await providerFor(id, t.fetch).complete(request);
    expect(response).toMatchObject({
      provider: id,
      model: id === "google" ? "modele-demande-1" : SERVED,
      stop: "max-tokens",
      usage: { inputTokens: USAGE.input, outputTokens: USAGE.output },
    });
    expect(response.output as unknown).toBeUndefined();
    expect(t.calls).toHaveLength(1);
  });

  it("sortie texte coupée : le texte partiel est rendu avec « max-tokens »", async () => {
    const t = scripted(() => cutResponse(FORMAT_OF[id], "début"));
    const response = await providerFor(id, t.fetch).complete(requestFor(id));
    expect(response).toMatchObject({ stop: "max-tokens", output: "début" });
  });
});
