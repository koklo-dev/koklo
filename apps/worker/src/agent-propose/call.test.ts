import { framePrompt, trusted } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { benchOf, LAUNCH, ScriptedAi } from "../../test/support/propose-run.ts";
import { ask, timeUp } from "./call.ts";
import { OutputInvalidError, OutputRefusedError, OutputTruncatedError } from "./errors.ts";
import type { LaunchSources } from "./sources.ts";

/** TK-114b (B617, B618) : temps d'un segment et appel au modèle (battement, arrêt normal exigé, motifs fermés). */
const SOURCES: LaunchSources = {
  tag: "architecture",
  pages: [],
  synthesis: null,
  risks: null,
  features: [],
  rules: [],
  roles: [],
  flows: [],
};

const call = {
  purpose: "proposal-batch" as const,
  prompt: (nonce: string) => framePrompt({ instructions: trusted`Consigne`, nonce, data: [] }),
  schema: { type: "object" },
  parse: (raw: unknown) => {
    if (typeof raw !== "object" || raw === null) throw new Error("forme");
    return raw;
  },
};

describe("call (TK-114b)", () => {
  it("timeUp : du temps reste ; épuisé → handoff ; au huitième segment → deadline", () => {
    const ai = new ScriptedAi(() => ({ output: {} }));
    const { run } = benchOf(SOURCES, ai, { deadlineMs: 100 });
    ai.clock = 100;
    expect(timeUp(run)).toBeUndefined();
    ai.clock = 101;
    expect(timeUp(run)).toBe("handoff");
    const last = benchOf(SOURCES, ai, { deadlineMs: 100, progress: { segment: 7 } });
    expect(timeUp(last.run)).toBe("deadline");
  });

  it("ask : battement puis appel routé de l'organisation, nonce neuf, sortie validée", async () => {
    const ai = new ScriptedAi(() => ({ output: { ok: true } }));
    const { run, store } = benchOf(SOURCES, ai);
    let beats = 0;
    store.heartbeat = async () => {
      expect(ai.requests).toHaveLength(beats);
      beats += 1;
    };
    const nonces: string[] = [];
    const prompt = (nonce: string) => {
      nonces.push(nonce);
      return call.prompt(nonce);
    };
    const spied = { ...call, prompt };
    expect(await ask(run, spied)).toEqual({ ok: true });
    await ask(run, spied);
    expect(beats).toBe(2);
    const [first] = ai.requests;
    expect(first).toMatchObject({
      organizationId: LAUNCH.organizationId,
      userId: LAUNCH.requestedBy,
      usage: "spec_deliverables",
      euOnly: false,
      output: { kind: "json", schema: { type: "object" } },
      trace: { purpose: "proposal-batch", correlationId: LAUNCH.id },
    });
    expect(new Set(nonces).size).toBe(2);
  });

  it("arrêt anormal ou sortie hors forme : motif fermé, jamais le texte du fournisseur", async () => {
    const stops = [
      ["max-tokens", OutputTruncatedError],
      ["refusal", OutputRefusedError],
      ["stop-sequence", OutputInvalidError],
    ] as const;
    for (const [stop, kind] of stops) {
      const ai = new ScriptedAi(() => ({ output: "secret du fournisseur", stop }));
      const error = await ask(benchOf(SOURCES, ai).run, call).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(kind);
      expect(String((error as Error).message)).not.toContain("secret");
    }
    const ai = new ScriptedAi(() => ({ output: "texte du fournisseur" }));
    const error = await ask(benchOf(SOURCES, ai).run, call).catch((e: unknown) => e);
    expect((error as Error).name).toBe("LlmInvalidOutputError");
    expect(String((error as Error).message)).not.toContain("texte du fournisseur");
  });
});
