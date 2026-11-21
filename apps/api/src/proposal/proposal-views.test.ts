import { describe, expect, it } from "vitest";
import type { LaunchRecord } from "./launch.repository.ts";
import { launchView } from "./proposal-views.ts";

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
});
