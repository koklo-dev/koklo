import { describe, expect, it } from "vitest";
import type { LaunchRecord } from "./launch.repository.ts";
import type { ProposalRecord } from "./proposal.repository.ts";
import { launchView, proposalView } from "./proposal-views.ts";

/**
 * TK-114b (contrat 3.12.0, B620) : `launch.report`, rendu pour le livrable Architecture seulement, à partir des colonnes
 * du bilan validées par le schéma du contrat ; une valeur illisible fait omettre le bilan, jamais une erreur.
 */
const COVERAGE = {
  features: { covered: 38, total: 174 },
  flows: { covered: 3, total: 22 },
  tables: { covered: 48, total: 48 },
};
const PROGRESS = {
  zones: ["Données", "Réservations", "Paiement"],
  zonesDone: 2,
  zonesDiscarded: 1,
  discardReasons: { output_invalid: 1, truncated: 2 },
  coverageCalls: 4,
  coverageBefore: null,
  coverageAfter: COVERAGE,
  stopReason: "cap",
};
const launch = (over: Partial<LaunchRecord> = {}): LaunchRecord => ({
  id: "6f1c2c1e-8d0a-4e8e-9f61-3f0b7c1a2b3c",
  deliverable: "architecture",
  mode: "complete",
  status: "done",
  errorCode: null,
  proposedCount: 12,
  discardedCount: 1,
  baseVersion: null,
  requestedBy: "u",
  lastSeenAt: null,
  finishedAt: null,
  progress: PROGRESS,
  ...over,
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même fonction, un test par comportement
describe("launchView : bilan du lancement (TK-114b)", () => {
  it("Architecture : zones demandées, traitées, écartées, motifs dans l'ordre du vocabulaire, couverture et motif d'arrêt", () => {
    expect(launchView(launch()).report).toEqual({
      zonesRequested: 3,
      zonesDone: 2,
      zonesDiscarded: 1,
      discardReasons: [
        { reason: "truncated", count: 2 },
        { reason: "output_invalid", count: 1 },
      ],
      coverageAfter: COVERAGE,
      coverageCalls: 4,
      stopReason: "cap",
    });
  });

  it("Fonctionnel et Données : aucun bilan, réponse inchangée", () => {
    for (const deliverable of ["functional", "data"]) {
      expect(launchView(launch({ deliverable })), deliverable).not.toHaveProperty("report");
    }
  });

  it("valeurs illisibles : motif inconnu ou compte nul ignorés ; couverture malformée ou zones non listées → bilan omis", () => {
    const odd = launchView(
      launch({
        progress: { ...PROGRESS, discardReasons: { provider: 3, refused: 0, truncated: 1 } },
      }),
    );
    expect(odd.report?.discardReasons).toEqual([{ reason: "truncated", count: 1 }]);
    const broken = { ...PROGRESS, coverageAfter: { features: { covered: -1, total: 2 } } };
    expect(launchView(launch({ progress: broken }))).not.toHaveProperty("report");
    expect(launchView(launch({ progress: { ...PROGRESS, zones: "x" } }))).not.toHaveProperty(
      "report",
    );
    expect(
      launchView(launch({ progress: { ...PROGRESS, stopReason: "boom" } })),
    ).not.toHaveProperty("report");
  });

  it("TK-114c (contrat 3.13.0, B640) : la couverture des liens écrite par le worker est rendue telle quelle", () => {
    const links = { ...COVERAGE, links: { covered: 20, total: 23 } };
    const view = launchView(
      launch({ progress: { ...PROGRESS, coverageBefore: COVERAGE, coverageAfter: links } }),
    );
    expect(view.report?.coverageAfter).toEqual(links);
    expect(view.report?.coverageBefore).toEqual(COVERAGE);
  });

  it("TK-114d (contrat 3.14.0, B660) : rôles et flux repris écrits par le worker rendus tels quels", () => {
    const after = {
      ...COVERAGE,
      roles: { covered: 5, total: 5 },
      reprises: { covered: 21, total: 22, skipped: [{ reason: "too_long", count: 1 }] },
    };
    const view = launchView(launch({ progress: { ...PROGRESS, coverageAfter: after } }));
    expect(view.report?.coverageAfter).toEqual(after);
  });

  it("TK-114e (contrat 3.15.0, B670, B677) : sectionsExisting depuis existing_section, absent des motifs ; nul ou illisible → omis", () => {
    const progress = { ...PROGRESS, discardReasons: { existing_section: 2, truncated: 1 } };
    const view = launchView(launch({ progress }));
    expect(view.report?.sectionsExisting).toBe(2);
    expect(view.report?.discardReasons).toEqual([{ reason: "truncated", count: 1 }]);
    for (const existing_section of [0, "2", 1.5]) {
      const odd = { ...PROGRESS, discardReasons: { existing_section } };
      expect(
        launchView(launch({ progress: odd })).report,
        String(existing_section),
      ).not.toHaveProperty("sectionsExisting");
    }
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même fonction, un test par comportement
describe("TK-115b (contrat 3.20.0, B849) : bilan du cahier technique et de la Sécurité", () => {
  const STEPS = [{ step: "Stack · Services et API", reason: "truncated" }];
  const progress = (discardReasons: object) => ({
    ...PROGRESS,
    coverageAfter: null,
    coverageCalls: 0,
    stopReason: "completed",
    discardReasons,
  });
  const reportFor = (deliverable: string, discardReasons: object) =>
    launchView(launch({ deliverable, progress: progress(discardReasons) })).report;

  it.each(["technical", "security"])("%s : report avec les étapes écartées nommées", (key) => {
    const counts = { truncated: 1, discarded_steps: STEPS, existing_section: 2 };
    expect(reportFor(key, counts)).toEqual({
      zonesRequested: 3,
      zonesDone: 2,
      zonesDiscarded: 1,
      discardReasons: [{ reason: "truncated", count: 1 }],
      discardedSteps: STEPS,
      coverageCalls: 0,
      stopReason: "completed",
      sectionsExisting: 2,
    });
  });

  it("Architecture : sans discardedSteps ; Fonctionnel et Données : aucun report", () => {
    const counts = { truncated: 1, discarded_steps: STEPS };
    expect(reportFor("architecture", counts)).toBeDefined();
    expect(reportFor("architecture", counts)).not.toHaveProperty("discardedSteps");
    expect(reportFor("functional", counts)).toBeUndefined();
    expect(reportFor("data", counts)).toBeUndefined();
  });

  it("entrées illisibles ignorées, douze au plus ; aucune ou lancement antérieur : champ absent", () => {
    const odd = [
      null,
      "x",
      { step: "", reason: "truncated" },
      { step: "A", reason: "provider" },
      { step: "B", reason: "refused", detail: "texte" },
      ...Array.from({ length: 14 }, (_, i) => ({ step: `É${i}`, reason: "refused" })),
    ];
    const steps = reportFor("technical", { refused: 14, discarded_steps: odd })?.discardedSteps;
    expect(steps).toHaveLength(12);
    expect(steps?.[0]).toEqual({ step: "É0", reason: "refused" });
    for (const discarded_steps of [undefined, [], "x", [null]]) {
      const report = reportFor("technical", { truncated: 1, discarded_steps });
      expect(report, String(discarded_steps)).toBeDefined();
      expect(report).not.toHaveProperty("discardedSteps");
    }
  });
});

describe("TK-114g (contrat 3.16.0, B700) : proposalView.discardReason", () => {
  const record = (discardReason: "already_present" | null): ProposalRecord => ({
    id: "6f1c2c1e-8d0a-4e8e-9f61-3f0b7c1a2b3d",
    launchId: "6f1c2c1e-8d0a-4e8e-9f61-3f0b7c1a2b3c",
    deliverable: "architecture",
    kind: "doc_section",
    zone: "Noyau",
    position: 0,
    title: "Contexte",
    rationale: "Manque",
    payload: { title: "Contexte", markdown: "Texte." },
    status: discardReason === null ? "pending" : "rejected",
    appliedBatchId: null,
    discardReason,
    createdAt: new Date("2026-11-24T10:00:00.000Z"),
  });

  it("rendu seulement s'il est posé", () => {
    expect(proposalView(record("already_present"))).toMatchObject({
      status: "rejected",
      discardReason: "already_present",
    });
    expect(proposalView(record(null))).not.toHaveProperty("discardReason");
  });
});
