import {
  InvalidLlmRequestError,
  LlmAuthError,
  type LlmProvider,
  type LlmStreamEvent,
} from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import { describe, expect, it } from "vitest";
import { rejection } from "./support/harness.ts";
import { bench, drain, REQUEST } from "./support/router-bench.ts";

const op = { operation: "stream", provider: "anthropic" } as const;
const END = {
  type: "end",
  stop: "end",
  usage: { inputTokens: 10, outputTokens: 5 },
  provider: "fake",
  model: "claude-sonnet-5-5",
} as const satisfies LlmStreamEvent;

const failingStream = (afterChunks: number): LlmProvider => ({
  id: "fake",
  complete: async () => {
    throw new Error("inutilisé");
  },
  stream: async function* () {
    for (let i = 0; i < afterChunks; i++) yield { type: "text", text: "a" } as const;
    throw new LlmAuthError(op);
  },
});

describe("TK-95 B · flux de texte", () => {
  it("rend les morceaux puis l'événement final au fournisseur servi, et compte à la fin", async () => {
    const { router, meter } = bench({ providers: { anthropic: FakeLlm.replying("a".repeat(40)) } });
    const events = await drain(router.stream(REQUEST()));
    expect(events.filter((e) => e.type === "text")).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({
      type: "end",
      provider: "anthropic",
      model: "claude-sonnet-5-5",
    });
    expect(meter.entries).toHaveLength(1);
    expect(meter.entries[0]?.provider).toBe("anthropic");
  });

  it("rien n'est compté tant que le flux n'est pas terminé", async () => {
    const { router, meter } = bench({ providers: { anthropic: FakeLlm.replying("a".repeat(40)) } });
    const iterator = router.stream(REQUEST())[Symbol.asyncIterator]();
    await iterator.next();
    expect(meter.entries).toEqual([]);
    await iterator.return(undefined);
    expect(meter.entries).toEqual([]);
  });

  it("échec avant tout morceau : un seul essai chez le secours, journalisé", async () => {
    const { router, events, meter } = bench({ providers: { anthropic: failingStream(0) } });
    const out = await drain(router.stream(REQUEST()));
    expect(out.at(-1)).toMatchObject({ type: "end", provider: "openai" });
    expect(events.events).toHaveLength(1);
    expect(meter.entries.map((e) => e.provider)).toEqual(["openai"]);
  });

  it("échec après un morceau déjà rendu : pas de bascule, l'erreur est rendue", async () => {
    const openai = FakeLlm.replying("x");
    const { router, events } = bench({ providers: { anthropic: failingStream(1), openai } });
    expect(await rejection(drain(router.stream(REQUEST())))).toBeInstanceOf(LlmAuthError);
    expect(openai.calls).toHaveLength(0);
    expect(events.events).toEqual([]);
  });

  it("sortie JSON refusée en flux, rien n'est compté", async () => {
    const { router, meter } = bench();
    const request = REQUEST({ output: { kind: "json", schema: { type: "object" } } });
    expect(await rejection(drain(router.stream(request)))).toBeInstanceOf(InvalidLlmRequestError);
    expect(meter.entries).toEqual([]);
  });

  it("un flux sans événement final ne compte rien", async () => {
    const silent: LlmProvider = {
      ...failingStream(0),
      stream: async function* () {
        yield { type: "text", text: "a" } as const;
      },
    };
    const { router, meter } = bench({ providers: { anthropic: silent } });
    await drain(router.stream(REQUEST()));
    expect(meter.entries).toEqual([]);
    expect(END.type).toBe("end");
  });
});
