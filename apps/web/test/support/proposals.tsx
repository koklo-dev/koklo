import { PROJECT_ID, renderFeatures, serve } from "./features.tsx";
import { apiError, procedures } from "./web-mocks.ts";

/** Faux serveur des propositions (contrat 2.9.0) : lecture par groupe, décisions, lots d'enregistrement. */
export const LAUNCH_ID = "0190aaaa-0000-7000-8000-000000000001";
const uuid = (n: number): string => `0190bbbb-0000-7000-8000-${String(n).padStart(12, "0")}`;

export interface Fake {
  id: string;
  launchId: string;
  kind: "feature" | "criteria";
  zone: string;
  position: number;
  title: string;
  rationale: string;
  content: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected";
  appliedBatchId: string | null;
  createdAt: string;
}

const CRITERION = {
  title: "Réservation confirmée",
  steps: [
    { type: "etant_donne", text: "un créneau libre" },
    { type: "quand", text: "la personne réserve" },
    { type: "alors", text: "elle reçoit une confirmation" },
  ],
};

export const fake = (n: number, over: Partial<Fake> = {}): Fake => ({
  id: uuid(n),
  launchId: LAUNCH_ID,
  kind: "feature",
  zone: "Réservation",
  position: n - 1,
  title: `Réserver un créneau ${n}`,
  rationale: "Le dossier d'idée l'annonce.",
  content: {
    title: `Réserver un créneau ${n}`,
    priority: "must",
    description: `Description ${n}`,
    criteria: [CRITERION],
  },
  status: "pending",
  appliedBatchId: null,
  createdAt: "2026-11-11T10:00:00.000Z",
  ...over,
});

export const many = (count: number, zones = 1, over: (n: number) => Partial<Fake> = () => ({})) =>
  Array.from({ length: count }, (_, i) =>
    fake(i + 1, { zone: `Zone ${(i % zones) + 1}`, ...over(i + 1) }),
  );

export const store: { items: Fake[]; launchStatus: string; options: unknown } = {
  items: [],
  launchStatus: "done",
  options: null,
};

const keyOf = (p: Fake): string => `${p.kind}:${p.zone}`;

function groupsOf(items: Fake[]) {
  const flat = items.length <= 30;
  const keys = flat ? ["all"] : [...new Set(items.map(keyOf))];
  return keys.map((key) => {
    const own = flat ? items : items.filter((p) => keyOf(p) === key);
    const n = (s: string) => own.filter((p) => p.status === s).length;
    return {
      key,
      label: flat ? "Toutes" : `Fonctionnalités · ${key.split(":")[1]}`,
      total: own.length,
      accepted: n("accepted"),
      rejected: n("rejected"),
      pending: n("pending"),
    };
  });
}

function listAnswer(input: Record<string, unknown>) {
  let items = store.items;
  if (input.group && input.group !== "all") items = items.filter((p) => keyOf(p) === input.group);
  if (input.status === "pending") items = items.filter((p) => p.status === "pending");
  const from = input.cursor ? Number(input.cursor) : 0;
  const limit = Number(input.limit ?? 50);
  const page = items.slice(from, from + limit);
  const launch = store.items.length
    ? {
        id: LAUNCH_ID,
        status: store.launchStatus,
        proposedCount: store.items.length,
        discardedCount: 0,
      }
    : null;
  return {
    items: page,
    nextCursor: from + limit < items.length ? String(from + limit) : null,
    previousCursor: null,
    offset: from,
    total: items.length,
    groups: groupsOf(store.items),
    launch,
  };
}

/** Installe le faux serveur : propositions de départ, options du modal, décisions qui modifient le magasin. */
export function serveProposals(items: Fake[], over: { launchStatus?: string } = {}): void {
  store.items = items;
  store.launchStatus = over.launchStatus ?? "done";
  procedures.proposalList.mockImplementation(async (input: unknown) =>
    listAnswer(input as Record<string, unknown>),
  );
  procedures.aiProposeOptions.mockResolvedValue({
    options: [
      { id: "complete", recommended: true },
      { id: "criteria", count: 3, recommended: false },
      { id: "update", count: 0, recommended: false },
      { id: "all", recommended: false },
    ],
    reads: [
      { id: "idea", label: "Dossier d'idée figé" },
      { id: "spec", label: "Cahier fonctionnel actuel" },
    ],
    available: true,
  });
  procedures.proposalDecide.mockImplementation(
    async (input: { proposalId: string; decision: string; edited?: Record<string, unknown> }) => {
      const found = store.items.find((p) => p.id === input.proposalId) as Fake;
      found.status = ({ accept: "accepted", reject: "rejected", reset: "pending" } as const)[
        input.decision as "accept"
      ];
      if (input.edited) found.content = input.edited;
      return found;
    },
  );
  procedures.proposalDecideMany.mockImplementation(
    async (input: { group: string; expectedPending: number }) => {
      const own = store.items.filter((p) => keyOf(p) === input.group && p.status === "pending");
      if (own.length !== input.expectedPending) {
        throw apiError("PROPOSAL_COUNT_CHANGED", {
          expected: input.expectedPending,
          actual: own.length,
        });
      }
      for (const p of own) p.status = "accepted";
      return { decided: own.length };
    },
  );
  procedures.specBatchSubmit.mockImplementation(async (input: { proposalIds: string[] }) => {
    const id = `0190cccc-0000-7000-8000-${String(procedures.specBatchSubmit.mock.calls.length).padStart(12, "0")}`;
    for (const p of store.items) if (input.proposalIds.includes(p.id)) p.appliedBatchId = id;
    return { id, status: "committed", errorCode: null, commitSha: "a".repeat(40), results: [] };
  });
  procedures.specBatchGet.mockImplementation(async (input: { batchId: string }) => ({
    id: input.batchId,
    status: "committed",
  }));
}

export const renderTeam = (search = ""): ReturnType<typeof renderFeatures> => {
  serve("owner");
  return renderFeatures({ search });
};

export { PROJECT_ID };
