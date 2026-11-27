import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, generateOpenApi } from "../src/index.ts";
import { errors, INSTANT, isValid, output, parsed, UUID } from "./support.ts";

/**
 * TK-115b (contrat 3.20.0, additif, B846 à B851) : `launch.report` rendu aussi au cahier technique et à la Sécurité avec
 * les étapes écartées nommées ; `review.submit` refuse `stack_missing`.
 */
const REPORT = {
  zonesRequested: 12,
  zonesDone: 10,
  zonesDiscarded: 2,
  discardReasons: [{ reason: "truncated", count: 2 }],
  coverageCalls: 0,
  stopReason: "completed",
};
const page = (report: unknown) => ({
  items: [],
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: 0,
  groups: [],
  launch: {
    id: UUID,
    status: "done",
    proposedCount: 0,
    discardedCount: 2,
    finishedAt: INSTANT,
    report,
  },
});
const valid = (discardedSteps: unknown) =>
  isValid(output("proposal.list"), page({ ...REPORT, discardedSteps }));
const step = (over: object = {}) => ({
  step: "Stack · Services et API",
  reason: "truncated",
  ...over,
});

describe("contrat 3.20.0", () => {
  it("version 3.20.0 (additif : mineure)", async () => {
    expect(CONTRACT_VERSION).toBe("3.20.0");
    const doc = (await generateOpenApi()) as { info: { version: string } };
    expect(doc.info.version).toBe("3.20.0");
  });

  it("report.discardedSteps : facultatif, rendu tel quel", async () => {
    expect(await isValid(output("proposal.list"), page(REPORT))).toBe(true);
    const report = { ...REPORT, discardedSteps: [step(), step({ reason: "output_invalid" })] };
    const kept = await parsed(output("proposal.list"), page(report));
    expect(kept?.launch).toMatchObject({ report });
  });

  it("nom de 1 à 120 caractères, motif fermé, douze étapes au plus, aucun champ en plus", async () => {
    expect(await valid([step({ step: "x".repeat(120) })])).toBe(true);
    expect(await valid(Array.from({ length: 12 }, () => step()))).toBe(true);
    for (const bad of [
      [step({ step: "" })],
      [step({ step: "x".repeat(121) })],
      [step({ reason: "provider" })],
      [step({ detail: "texte du fournisseur" })],
      Array.from({ length: 13 }, () => step()),
    ]) {
      expect(await valid(bad), JSON.stringify(bad).slice(0, 80)).toBe(false);
    }
  });

  it("review.submit : conflit stack_missing déclaré, avec les précédents", async () => {
    const data = errors("review.submit").CONFLICT?.data;
    for (const reason of ["stack_missing", "choices_open", "threats_open"]) {
      expect(await isValid(data, { reason }), reason).toBe(true);
    }
    expect(await isValid(data, { reason: "stack_absent" })).toBe(false);
  });
});
