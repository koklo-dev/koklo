import { LlmAuthError, LlmProviderUnavailableError } from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import * as Sentry from "@sentry/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { allAuditText, flatten, installAiBench } from "./helpers/ai-bench.ts";
import { providersApi, sealedRows } from "./helpers/ai-providers.ts";
import { containsSecret, makeSentinel } from "./helpers/llm-credentials.ts";
import { createWorld } from "./helpers/tickets.ts";

vi.mock("@sentry/node", () => ({ init: vi.fn(), captureException: vi.fn() }));

/**
 * TK-98 lot A, cas 11 : ni la clé, ni l'adresse de base, ni un nom de fournisseur ne sortent par un
 * canal quelconque (réponses, en-têtes, erreurs typées, journaux, Sentry, audit, sortie de `list`), que
 * l'appel réussisse ou échoue. Les messages d'erreur sont fixes.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });
beforeEach(() => vi.clearAllMocks());

const HOST = "hote-sentinelle-44.example.com";
const PROVIDER_SENTINEL = "MESSAGE-FOURNISSEUR-SENTINELLE-55";
const NAMES = /anthropic|openai|google|mistral|openrouter/i;

class NoisyError extends LlmProviderUnavailableError {
  constructor(secret: string) {
    super({ operation: "complete", provider: "anthropic", status: 529 });
    this.message = `${PROVIDER_SENTINEL} ${secret} https://${HOST}`;
  }
}

const SCENARIOS: [
  string,
  (key: string) => FakeLlm | { id: "fake"; complete: () => Promise<never> },
][] = [
  ["succès", () => FakeLlm.replying("OK")],
  ["clé refusée", () => FakeLlm.failing(new LlmAuthError({ operation: "complete", status: 401 }))],
  ["erreur bavarde du port", (key) => FakeLlm.failing(new NoisyError(key))],
  [
    "exception inattendue contenant la clé et l'adresse",
    (key) => ({
      id: "fake",
      complete: () =>
        Promise.reject(Object.assign(new Error(`${key} https://${HOST}`), { cause: { key } })),
    }),
  ],
];

describe("add et replaceKey : aucune fuite, succès comme échec", () => {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: suite de cas d'une même procédure, un test par comportement
  it.each(SCENARIOS)("%s", async (_label, build) => {
    const b = bench();
    const world = await createWorld(b.database);
    const key = makeSentinel();
    const second = makeSentinel();
    b.use(build(key));
    const api = providersApi(b.app, world.actors.owner);

    const added = await api.add({
      provider: "openai_compatible",
      apiKey: key,
      baseUrl: `https://${HOST}/v1`,
    });
    const replaced = await api.replaceKey("openai_compatible", { apiKey: second });
    const listed = await api.list();

    const channels: Record<string, string> = {
      bodies: [added, replaced, listed].map((res) => JSON.stringify(res.body)).join("\n"),
      texts: [added, replaced, listed].map((res) => res.text).join("\n"),
      headers: [added, replaced, listed].map((res) => JSON.stringify(res.headers)).join("\n"),
      logs: b.lines.join("\n"),
      sentry: flatten(vi.mocked(Sentry.captureException).mock.calls),
      audit: await allAuditText(b.database, world.organizationId),
    };
    for (const [channel, haystack] of Object.entries(channels)) {
      for (const forbidden of [
        key,
        second,
        key.slice(0, 16),
        key.slice(-16),
        HOST,
        PROVIDER_SENTINEL,
      ]) {
        expect(haystack, `${channel} contient ${forbidden.slice(0, 20)}`).not.toContain(forbidden);
      }
    }
    for (const res of [added, replaced]) {
      if (res.status !== 200) {
        expect(res.text, "message d'erreur").not.toMatch(NAMES);
        expect(Object.keys(res.body.data ?? {})).toEqual(
          res.body.code === "LLM_PROVIDER_ERROR" ? ["reason"] : Object.keys(res.body.data ?? {}),
        );
      }
    }
    const rows = JSON.stringify(await sealedRows(b.database, world.organizationId));
    expect(containsSecret(rows, key)).toBe(false);
  });
});

describe("erreurs de validation : messages fixes, jamais la valeur ni un nom de fournisseur", () => {
  it("clé, modèle, adresse, usage et plafond invalides", async () => {
    const b = bench();
    const world = await createWorld(b.database);
    b.use(FakeLlm.replying("OK"));
    const api = providersApi(b.app, world.actors.owner);
    await api.add({ provider: "anthropic", apiKey: makeSentinel() });
    const bad = `valeur sentinelle 77 ${HOST}`;
    const responses = [
      await api.add({ provider: "openai", apiKey: "   " }),
      await api.add({ provider: "openai", apiKey: makeSentinel(), model: bad }),
      await api.add({
        provider: "openai_compatible",
        apiKey: makeSentinel(),
        baseUrl: `http://${HOST}`,
      }),
      await api.add({
        provider: "openai_compatible",
        apiKey: makeSentinel(),
        baseUrl: `https://${HOST}/v1`,
        model: "../x",
      }),
      await api.setUsage("idea_space", { provider: "openai", model: "inconnu-1" }),
      await api.remove("anthropic"),
      await api.update({ fallback: "anthropic" }),
    ];
    for (const res of responses) {
      expect(res.status, res.text).toBe(422);
      expect(res.text).not.toContain("sentinelle 77");
      expect(res.text).not.toContain(HOST);
      expect(res.text).not.toMatch(NAMES);
    }
  });
});

describe("list, settings, rapport : aucune adresse ni clé", () => {
  it("la sortie de list ne porte que les champs du contrat", async () => {
    const b = bench();
    const world = await createWorld(b.database);
    b.use(FakeLlm.replying("OK"));
    const api = providersApi(b.app, world.actors.owner);
    await api.add({
      provider: "openai_compatible",
      apiKey: makeSentinel(),
      baseUrl: `https://${HOST}/v1`,
    });
    const list = await api.list();
    expect(Object.keys(list.body.items[0]).sort()).toEqual([
      "baseUrlRequired",
      "euEligible",
      "intermediary",
      "lastUsedAt",
      "provider",
      "role",
      "status",
    ]);
    for (const res of [list, await api.settings(), await api.report(), await api.models()]) {
      expect(res.text).not.toContain(HOST);
    }
  });
});
