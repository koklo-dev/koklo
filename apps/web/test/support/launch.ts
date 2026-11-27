import { procedures } from "./web-mocks.ts";

/** TK-115b : dernier lancement du cahier technique ou de la sécurité, avec son bilan et ses étapes écartées (3.20.0). */
export const STEP_REPORT = {
  zonesRequested: 12,
  zonesDone: 10,
  zonesDiscarded: 2,
  discardReasons: [
    { reason: "truncated" as const, count: 1 },
    { reason: "output_invalid" as const, count: 1 },
  ],
  discardedSteps: [
    { step: "Stack · Services et API", reason: "truncated" as const },
    { step: "Exigences", reason: "output_invalid" as const },
  ],
  stopReason: "completed" as const,
};

export const SUMMARY_LINE = "Bilan du lancement · étapes traitées 12/12 · écartées 2 · terminé";
export const STEPS_LINE =
  "Étapes écartées : Stack · Services et API (réponse coupée), Exigences (réponse invalide)";

export const stepLaunch = (status: string, report: Record<string, unknown> = STEP_REPORT) => ({
  id: "0190aaaa-0000-7000-8000-000000000001",
  status,
  proposedCount: 0,
  discardedCount: 0,
  report,
});

/** Plus rien à relire : un lancement fini (ou `status`) sans aucune proposition. */
export function serveLaunch(report?: Record<string, unknown>, status = "done"): void {
  procedures.proposalList.mockResolvedValue({
    items: [],
    nextCursor: null,
    previousCursor: null,
    offset: 0,
    total: 0,
    groups: [],
    launch: stepLaunch(status, report),
  });
}
