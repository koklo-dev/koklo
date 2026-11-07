import { describe, expect, it } from "vitest";
import {
  InvalidLlmRequestError,
  LlmAbortedError,
  LlmAuthError,
  type LlmStreamEvent,
  LlmTimeoutError,
  llmCredential,
} from "../src/index.ts";
import { FakeLlm } from "../src/testing/index.ts";
import { makeRequest } from "./llm-helpers.ts";

const collect = async (events: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> => {
  const out: LlmStreamEvent[] = [];
  for await (const event of events) {
    out.push(event);
  }
  return out;
};

describe("TK-95 · FakeLlm.stream", () => {
  it("rend des morceaux de texte puis un événement final (arrêt, jetons, fournisseur, modèle)", async () => {
    const events = await collect(FakeLlm.replying("a".repeat(40)).stream(makeRequest()));
    const texts = events.filter((e) => e.type === "text");
    expect(texts.length).toBeGreaterThan(1);
    expect(texts.map((e) => (e as { text: string }).text).join("")).toBe("a".repeat(40));
    const last = events.at(-1);
    expect(last).toMatchObject({
      type: "end",
      stop: "end",
      provider: "fake",
      model: "claude-test-1",
    });
    expect(events.filter((e) => e.type === "end")).toHaveLength(1);
    expect((last as { usage: { outputTokens: number } }).usage.outputTokens).toBe(10);
  });

  it("applique les mêmes gardes que complete : requête invalide, clé refusée, annulation", async () => {
    await expect(
      collect(FakeLlm.replying("x").stream(makeRequest({ model: "../x" }))),
    ).rejects.toBeInstanceOf(InvalidLlmRequestError);
    await expect(
      collect(
        FakeLlm.replying("x", { rejectedKeys: ["k"] }).stream(
          makeRequest({ credential: llmCredential("k") }),
        ),
      ),
    ).rejects.toBeInstanceOf(LlmAuthError);
    const controller = new AbortController();
    controller.abort();
    await expect(
      collect(FakeLlm.replying("x").stream(makeRequest({ signal: controller.signal }))),
    ).rejects.toBeInstanceOf(LlmAbortedError);
  });

  it("refuse une sortie JSON en flux", async () => {
    await expect(
      collect(FakeLlm.replying("x").stream(makeRequest({ output: { kind: "json", schema: {} } }))),
    ).rejects.toMatchObject({ reason: "output" });
  });
});

describe("TK-95 · FakeLlm.stream : échec, annulation, journal", () => {
  it("propage l'échec programmé et s'arrête à l'annulation en cours de flux", async () => {
    await expect(
      collect(FakeLlm.failing(new LlmTimeoutError({ operation: "stream" })).stream(makeRequest())),
    ).rejects.toBeInstanceOf(LlmTimeoutError);
    const controller = new AbortController();
    const seen: LlmStreamEvent[] = [];
    const run = async () => {
      for await (const event of FakeLlm.replying("a".repeat(400)).stream(
        makeRequest({ signal: controller.signal }),
      )) {
        seen.push(event);
        controller.abort();
      }
    };
    await expect(run()).rejects.toBeInstanceOf(LlmAbortedError);
    expect(seen).toHaveLength(1);
  });

  it("enregistre l'appel sans la clé", async () => {
    const fake = FakeLlm.replying("ok");
    await collect(fake.stream(makeRequest()));
    expect(fake.calls).toHaveLength(1);
    expect(JSON.stringify(fake.calls)).not.toContain("SENTINELLE-0123456789");
  });
});
