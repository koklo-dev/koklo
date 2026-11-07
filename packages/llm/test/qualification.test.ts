import {
  AI_USAGES,
  type AiUsage,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  unvalidated,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  buildCatalog,
  QUALIFICATION_CASES,
  type QualificationContracts,
  runQualification,
} from "../src/index.ts";
import { makeRequest, PROMPT } from "./support/harness.ts";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const has = (v: unknown, ...keys: string[]): boolean => isRecord(v) && keys.every((k) => k in v);

/** Contrats de sortie par usage (le vrai code branche les schémas Zod ; ici des gardes équivalentes). */
const CONTRACTS: QualificationContracts = {
  idea_space: { jsonSchema: { type: "object" }, accepts: (v) => has(v, "title", "summary") },
  spec_deliverables: { jsonSchema: { type: "object" }, accepts: (v) => has(v, "deliverables") },
  baseline_summary: { jsonSchema: { type: "object" }, accepts: (v) => has(v, "summary") },
  ticket_breakdown: { jsonSchema: { type: "object" }, accepts: (v) => has(v, "tickets") },
};
const GOOD: Record<AiUsage, unknown> = {
  idea_space: { title: "t", summary: "s" },
  spec_deliverables: { deliverables: [] },
  baseline_summary: { summary: "s" },
  ticket_breakdown: { tickets: [] },
};

const model = (
  reply: (usage: AiUsage, request: LlmRequest) => Partial<LlmResponse> | Error,
): LlmProvider => ({
  id: "fake",
  stream: async function* () {},
  complete: async (request) => {
    const out = reply(request.trace.purpose as AiUsage, request);
    if (out instanceof Error) throw out;
    return {
      output: unvalidated(GOOD[request.trace.purpose as AiUsage]),
      stop: "end",
      usage: { inputTokens: 1, outputTokens: 1 },
      provider: "fake",
      model: request.model,
      ...out,
    };
  },
});

const run = (provider: LlmProvider) =>
  runQualification({
    provider,
    providerId: "anthropic",
    model: "claude-sonnet-5-5",
    credential: makeRequest().credential,
    contracts: CONTRACTS,
  });

describe("jeu de dossiers de référence", () => {
  it.each(AI_USAGES)("%s : au moins trois dossiers en français, sans donnée réelle", (usage) => {
    const cases = QUALIFICATION_CASES[usage];
    expect(cases.length).toBeGreaterThanOrEqual(3);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) {
      expect(c.brief.length).toBeGreaterThan(40);
      expect(c.brief).not.toMatch(/@|https?:\/\/|\b\d{10}\b/);
    }
  });
  it("le jeu est gelé", () => {
    expect(Object.isFrozen(QUALIFICATION_CASES)).toBe(true);
  });
  void PROMPT;
});

describe("suite de qualification par usage (faux modèle, aucun réseau)", () => {
  it("un modèle conforme est qualifié pour les quatre usages", async () => {
    const report = await run(model(() => ({})));
    for (const usage of AI_USAGES) {
      expect(report.usages[usage]).toMatchObject({ qualified: true, failures: [] });
    }
  });

  it("rejette un JSON hors schéma, une sortie tronquée et un refus, par usage", async () => {
    const report = await run(
      model((usage) => {
        if (usage === "idea_space") return { output: unvalidated({ autre: 1 }) };
        if (usage === "spec_deliverables") return { stop: "max-tokens" };
        if (usage === "baseline_summary")
          return new (class extends Error {
            override name = "LlmRefusedError";
          })();
        return {};
      }),
    );
    expect(report.usages.idea_space.failures[0]?.reason).toBe("schema");
    expect(report.usages.spec_deliverables.failures[0]?.reason).toBe("truncated");
    expect(report.usages.baseline_summary.failures[0]?.reason).toBe("error");
    expect(report.usages.ticket_breakdown.qualified).toBe(true);
    expect(report.usages.idea_space.qualified).toBe(false);
  });

  it("un seul dossier en échec suffit à disqualifier l'usage", async () => {
    let n = 0;
    const report = await run(
      model((usage) =>
        usage === "ticket_breakdown" && ++n === 2 ? { output: unvalidated("pas du json") } : {},
      ),
    );
    expect(report.usages.ticket_breakdown.qualified).toBe(false);
    expect(report.usages.ticket_breakdown.failures).toHaveLength(1);
  });

  it("n'imprime et ne conserve ni sortie ni clé dans le rapport", async () => {
    const report = await run(model(() => ({})));
    const text = JSON.stringify(report);
    expect(text).not.toContain("SENTINELLE");
  });
});

describe("catalogue des modèles qualifiés", () => {
  it("ne retient que les usages qualifiés, avec l'indicateur économique", async () => {
    const report = await run(
      model((usage) => (usage === "idea_space" ? { output: unvalidated({}) } : {})),
    );
    const catalog = buildCatalog([{ report, economy: false }]);
    expect(catalog).toEqual([
      {
        provider: "anthropic",
        model: "claude-sonnet-5-5",
        usages: ["spec_deliverables", "baseline_summary", "ticket_breakdown"],
        economy: false,
      },
    ]);
  });
  it("un modèle qualifié pour aucun usage n'apparaît pas", async () => {
    const report = await run(model(() => ({ stop: "max-tokens" })));
    expect(buildCatalog([{ report, economy: true }])).toEqual([]);
  });
});
