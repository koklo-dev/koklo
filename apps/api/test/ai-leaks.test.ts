import { LlmProviderUnavailableError, LlmRateLimitedError } from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import * as Sentry from "@sentry/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aiApi,
  allAuditText,
  BRIEF_REPLY,
  featuresReply,
  flatten,
  installAiBench,
  keyedWorld,
} from "./helpers/ai-bench.ts";
import { OTHER_ENCRYPTION_KEY } from "./helpers/installations.ts";

vi.mock("@sentry/node", () => ({ init: vi.fn(), captureException: vi.fn() }));

/**
 * TK-54b (CDC §15) : la clé BYOK, le brief, le prompt, la sortie du modèle, le nonce et les
 * messages du fournisseur ne sortent jamais : ni réponses HTTP (corps et en-têtes), ni erreurs
 * typées, ni journaux, ni Sentry (`captureError`), ni audit. Chaque scénario pose des sentinelles.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });
beforeEach(() => vi.clearAllMocks());

const BRIEF_SENTINEL = "BRIEF-SENTINELLE-LEAK-11";
const OUTPUT_SENTINEL = "SORTIE-SENTINELLE-LEAK-22";
const PROVIDER_SENTINEL = "MESSAGE-FOURNISSEUR-SENTINELLE-33";

class NoisyProviderError extends LlmProviderUnavailableError {
  constructor(secret: string) {
    super({ operation: "complete", provider: "anthropic", status: 529 });
    this.message = `${PROVIDER_SENTINEL} ${secret} ${BRIEF_SENTINEL}`;
    Object.defineProperty(this, "hidden", {
      value: `${PROVIDER_SENTINEL} ${secret}`,
      enumerable: false,
    });
    Object.defineProperty(this, "cause", {
      value: new Error(`${PROVIDER_SENTINEL} ${secret}`),
      enumerable: false,
    });
  }
}

type Scenario = [string, (key: string) => FakeLlm | { id: "fake"; complete: () => Promise<never> }];
const SCENARIOS: Scenario[] = [
  ["succès", () => FakeLlm.replying(BRIEF_REPLY)],
  [
    "sortie invalide portant des sentinelles",
    () => FakeLlm.replying({ ...BRIEF_REPLY, problem: `https://evil.test/${OUTPUT_SENTINEL}` }),
  ],
  [
    "erreur du port qui porte le message, une cause et un champ caché",
    (key) => FakeLlm.failing(new NoisyProviderError(key)),
  ],
  [
    "429 du fournisseur",
    () => FakeLlm.failing(new LlmRateLimitedError({ operation: "complete", retryAfterMs: 1000 })),
  ],
  [
    "exception inattendue contenant la clé, le brief et le prompt",
    (key) => ({
      id: "fake",
      complete: () =>
        Promise.reject(
          Object.assign(new Error(`${key} ${BRIEF_SENTINEL} ${OUTPUT_SENTINEL}`), {
            cause: { key },
          }),
        ),
    }),
  ],
];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("la clé et les contenus ne sortent par aucun canal", () => {
  it.each(SCENARIOS)("%s", async (_label, build) => {
    const b = bench();
    const { world, key } = await keyedWorld(b);
    b.use(build(key));
    b.nonces.push("deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId, {
      idea: BRIEF_SENTINEL,
      answers: [BRIEF_SENTINEL],
    });

    expect([200, 429, 502]).toContain(res.status);
    const channels = {
      body: JSON.stringify(res.body),
      text: res.text,
      headers: JSON.stringify(res.headers),
      logs: b.lines.join("\n"),
      sentry: flatten(vi.mocked(Sentry.captureException).mock.calls),
      audit: await allAuditText(b.database, world.organizationId),
    };
    for (const [channel, haystack] of Object.entries(channels)) {
      for (const forbidden of [
        key,
        key.slice(0, 16),
        key.slice(-16),
        BRIEF_SENTINEL,
        PROVIDER_SENTINEL,
        "deadbeefdeadbeef",
      ]) {
        expect(haystack, `${channel} contient ${forbidden.slice(0, 20)}`).not.toContain(forbidden);
      }
    }
    if (res.status === 502) {
      expect(res.body.message).not.toContain(PROVIDER_SENTINEL);
      expect(Object.keys(res.body.data ?? {})).toEqual(["reason"]);
    }
    // Les contenus du modèle n'apparaissent que dans une réponse réussie.
    if (res.status !== 200) {
      expect(channels.body).not.toContain(OUTPUT_SENTINEL);
      expect(channels.logs).not.toContain(OUTPUT_SENTINEL);
    }
  });

  it("une exception inattendue du fournisseur devient LLM_PROVIDER_ERROR { unavailable } (jamais INTERNAL brut)", async () => {
    const b = bench();
    const { world, key } = await keyedWorld(b);
    b.use({ id: "fake", complete: () => Promise.reject(new Error(`${key} panne`)) });

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("LLM_PROVIDER_ERROR");
    expect(res.body.data).toEqual({ reason: "unavailable" });
  });

  it("les erreurs attendues (typées du port) ne vont pas à Sentry : pas de bruit, pas de contenu", async () => {
    const b = bench();
    const { world, key } = await keyedWorld(b);
    b.use(FakeLlm.failing(new NoisyProviderError(key)));

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("LLM_PROVIDER_ERROR");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("le journal d'un appel réussi ne porte que des compteurs et des noms (jamais de contenu)", async () => {
    const b = bench();
    const { world, key } = await keyedWorld(b);
    b.use(
      FakeLlm.replying(
        featuresReply({
          title: OUTPUT_SENTINEL,
          priority: "must",
          description: OUTPUT_SENTINEL,
          criteria: [
            {
              title: OUTPUT_SENTINEL,
              steps: [
                { type: "etant_donne", text: OUTPUT_SENTINEL },
                { type: "quand", text: OUTPUT_SENTINEL },
                { type: "alors", text: OUTPUT_SENTINEL },
              ],
            },
          ],
        }),
      ),
    );

    const res = await aiApi(b.app, world.actors.dev, {
      "x-request-id": "req-leak-1",
    }).proposeFeatures(world.projectId, { brief: BRIEF_SENTINEL });

    expect(res.status).toBe(200);
    const logs = b.lines.join("\n");
    expect(logs).not.toContain(OUTPUT_SENTINEL);
    expect(logs).not.toContain(BRIEF_SENTINEL);
    expect(logs).not.toContain(key);
    const events = b.lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) => line.event === "llm.complete" || line.purpose === "features-propose");
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]).toMatchObject({
      purpose: "features-propose",
      correlationId: "req-leak-1",
      provider: "anthropic",
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
      durationMs: expect.any(Number),
    });
    expect(Object.keys(events[0] ?? {}).sort()).not.toEqual(
      expect.arrayContaining(["prompt", "output", "apiKey", "nonce"]),
    );
  });

  it("clé non déchiffrable, absente ou invalidée : pas d'identifiant d'organisation ni de clé dans l'erreur", async () => {
    const b = bench();
    const { world, key } = await keyedWorld(b);
    const other = await b.makeApp({ encryptionKey: OTHER_ENCRYPTION_KEY });
    b.use(FakeLlm.replying(BRIEF_REPLY));

    const res = await aiApi(other, world.actors.dev).draftBrief(world.projectId);

    expect(res.status).toBe(409);
    const everything = `${JSON.stringify(res.body)}${b.lines.join("")}`;
    expect(everything).not.toContain(key);
    expect(everything).not.toContain(world.organizationId);
  });
});

describe("la clé n'est jamais lue ailleurs que par l'adaptateur", () => {
  it("le double reçoit la clé en clair (c'est son rôle) ; le prompt, lui, ne la contient pas", async () => {
    const b = bench();
    const { world, key } = await keyedWorld(b);
    const fake = FakeLlm.replying(BRIEF_REPLY);
    b.use(fake);

    await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(b.provider.keysSeen).toEqual([key]);
    for (const call of fake.calls) {
      expect(
        `${call.prompt.system}${call.prompt.user}${flatten(call.trace)}${call.model}`,
      ).not.toContain(key);
    }
  });
});
