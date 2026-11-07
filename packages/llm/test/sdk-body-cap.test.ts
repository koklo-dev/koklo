import { LLM_PROVIDER_IDS, LlmProviderUnavailableError } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { ANTHROPIC_MAX_RESPONSE_BYTES } from "../src/index.ts";
import { rejection } from "./support/harness.ts";
import { providerFor, requestFor, scripted } from "./support/sdk-bench.ts";
import { endlessResponse, FORMAT_OF, okResponse } from "./support/sdk-bodies.ts";

describe.each(LLM_PROVIDER_IDS.map((id) => [id] as const))("corps borné : %s", (id) => {
  it("taille annoncée trop grande : refusée sans lire le corps", async () => {
    const counter = { pulled: 0 };
    const t = scripted(() => {
      const response = endlessResponse(200, counter);
      return new Response(response.body, {
        status: 200,
        headers: { "content-length": String(ANTHROPIC_MAX_RESPONSE_BYTES + 1) },
      });
    });
    const error = await rejection(providerFor(id, t.fetch).complete(requestFor(id)));
    expect(error).toBeInstanceOf(LlmProviderUnavailableError);
    expect(counter.pulled).toBeLessThanOrEqual(65_536);
  });

  it("flux sans fin, succès ou erreur : coupé au plafond", async () => {
    for (const status of [200, 500]) {
      const counter = { pulled: 0 };
      const t = scripted(() => endlessResponse(status, counter));
      await rejection(providerFor(id, t.fetch).complete(requestFor(id)));
      expect(counter.pulled, String(status)).toBeLessThanOrEqual(
        ANTHROPIC_MAX_RESPONSE_BYTES + 3 * 65_536,
      );
      expect(counter.pulled, String(status)).toBeGreaterThan(0);
    }
  });

  it("un corps légitime sous le plafond passe", async () => {
    const t = scripted(() => okResponse(FORMAT_OF[id], "ok"));
    await expect(providerFor(id, t.fetch).complete(requestFor(id))).resolves.toBeDefined();
  });
});
