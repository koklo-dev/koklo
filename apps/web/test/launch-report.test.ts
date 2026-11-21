import { describe, expect, it } from "vitest";
import { launchDetailOf, launchReportOf } from "../src/lib/launch-report.ts";

/**
 * TK-114b (B619, DESIGN §5.25, S-spec-architecture §13) : textes du bilan du lancement de l'Architecture, formatés à partir
 * de `launch.report` (contrat 3.12.0). Jamais de texte du fournisseur : seuls des nombres et des motifs fermés.
 */
const count = (covered: number, total: number) => ({ covered, total });
const REPORT = {
  zonesRequested: 9,
  zonesDone: 7,
  zonesDiscarded: 2,
  discardReasons: [
    { reason: "truncated" as const, count: 1 },
    { reason: "output_invalid" as const, count: 1 },
  ],
  coverageBefore: { features: count(0, 174), flows: count(0, 22), tables: count(0, 48) },
  coverageAfter: { features: count(174, 174), flows: count(22, 22), tables: count(48, 48) },
  coverageCalls: 12,
  stopReason: "completed" as const,
};
const launch = (status: string, over: Partial<typeof REPORT> | null = {}) => ({
  id: "l",
  status: status as "done",
  proposedCount: 3,
  discardedCount: 0,
  ...(over === null ? {} : { report: { ...REPORT, ...over } }),
});

describe("launchDetailOf : ligne de détail de la Génération", () => {
  it("« Zones traitées N/M · écartées K · couverture X/Y » (traitées = retenues + écartées)", () => {
    const running = launch("running", {
      zonesDone: 2,
      zonesDiscarded: 2,
      coverageAfter: { features: count(38, 174), flows: count(0, 22), tables: count(0, 48) },
      stopReason: undefined,
    });
    expect(launchDetailOf(running)).toBe("Zones traitées 4/9 · écartées 2 · couverture 38/174");
  });

  it("avant la liste des zones : « Préparation des zones » ; sans couverture connue : rien sur la couverture", () => {
    expect(
      launchDetailOf(launch("running", { zonesRequested: 0, zonesDone: 0, zonesDiscarded: 0 })),
    ).toBe("Préparation des zones");
    const { coverageBefore: _b, coverageAfter: _a, ...bare } = REPORT;
    const noCoverage = {
      ...launch("running", null),
      report: { ...bare, zonesDone: 1, zonesDiscarded: 0 },
    };
    expect(launchDetailOf(noCoverage)).toBe("Zones traitées 1/9 · écartées 0");
  });

  it("couverture avant toute publication : celle d'avant le lancement", () => {
    const { coverageAfter: _a, ...before } = REPORT;
    const early = {
      ...launch("running", null),
      report: { ...before, zonesDone: 0, zonesDiscarded: 0 },
    };
    expect(launchDetailOf(early)).toBe("Zones traitées 0/9 · écartées 0 · couverture 0/174");
  });

  it("sans bilan (Fonctionnel, Données, lancement d'avant) : aucune ligne", () => {
    expect(launchDetailOf(launch("running", null))).toBeUndefined();
    expect(launchDetailOf(null)).toBeUndefined();
  });
});

describe("launchReportOf : bilan de la Relecture", () => {
  it("terminé : neutre, trois lignes (bilan, couverture avant/après, zones écartées par motif)", () => {
    expect(launchReportOf(launch("done"))).toEqual({
      variant: "neutral",
      icon: "info",
      lines: [
        "Bilan du lancement · zones traitées 9/9 · écartées 2 · couverture 174/174 · terminé",
        "Fonctionnalités servies 174/174 · parcours détaillés 22/22 · tables rattachées 48/48 · avant : 0/174, 0/22, 0/48",
        "Zones écartées : réponse coupée (1), réponse invalide (1)",
      ],
    });
  });

  it("arrêté au délai, au plafond, annulé, interrompu : avertissement", () => {
    const cases: [string, Partial<typeof REPORT>, string][] = [
      ["failed", { stopReason: "deadline" as never }, "arrêté au délai"],
      ["done", { stopReason: "cap" as never }, "arrêté au plafond"],
      ["canceled", { stopReason: "cancelled" as never }, "annulé"],
      ["failed", { stopReason: undefined }, "interrompu"],
    ];
    for (const [status, over, label] of cases) {
      const report = launchReportOf(launch(status, over));
      expect(report?.variant, label).toBe("warning");
      expect(report?.icon).toBe("warning");
      expect(report?.lines[0]).toMatch(new RegExp(` · ${label}$`));
    }
  });

  it("aucune zone écartée : pas de troisième ligne ; refus et consigne refusée ont leur libellé", () => {
    expect(
      launchReportOf(launch("done", { discardReasons: [], zonesDiscarded: 0 }))?.lines,
    ).toHaveLength(2);
    const other = launchReportOf(
      launch("done", {
        discardReasons: [
          { reason: "prompt_rejected" as never, count: 1 },
          { reason: "refused" as never, count: 2 },
        ],
      }),
    );
    expect(other?.lines[2]).toBe("Zones écartées : consigne refusée (1), refus du modèle (2)");
  });

  it("rien : lancement actif, sans bilan, ou d'avant TK-114b (aucune zone, aucun motif, aucune couverture)", () => {
    expect(launchReportOf(launch("running"))).toBeNull();
    expect(launchReportOf(launch("done", null))).toBeNull();
    expect(launchReportOf(null)).toBeNull();
    const { coverageBefore: _b, coverageAfter: _a, stopReason: _s, ...bare } = REPORT;
    const old = {
      ...launch("done", null),
      report: { ...bare, zonesRequested: 0, zonesDone: 0, zonesDiscarded: 0, discardReasons: [] },
    };
    expect(launchReportOf(old)).toBeNull();
  });
});
