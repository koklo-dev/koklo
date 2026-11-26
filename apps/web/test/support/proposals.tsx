import { PROJECT_ID, renderFeatures, serve } from "./features.tsx";
import { apiError, procedures } from "./web-mocks.ts";

/** Faux serveur des propositions (contrat 2.9.0) : lecture par groupe, décisions, lots d'enregistrement. */
export const LAUNCH_ID = "0190aaaa-0000-7000-8000-000000000001";
const uuid = (n: number): string => `0190bbbb-0000-7000-8000-${String(n).padStart(12, "0")}`;

export interface Fake {
  id: string;
  launchId: string;
  kind:
    | "feature"
    | "criteria"
    | "rule"
    | "role"
    | "flow"
    | "table"
    | "relations"
    | "fixtures"
    | "component"
    | "archflow"
    | "adr"
    | "doc_section";
  zone: string;
  position: number;
  title: string;
  rationale: string;
  content: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected";
  /** Déjà présente dans la spec (TK-114g, B697) : rejetée par le serveur, jamais par une personne. */
  discardReason?: "already_present";
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

export const store: { items: Fake[]; launchStatus: string; options: unknown; report?: unknown } = {
  items: [],
  launchStatus: "done",
  options: null,
};

const KIND_LABEL: Record<string, string> = {
  feature: "Fonctionnalités",
  criteria: "Critères",
  rule: "Règles",
  role: "Rôles",
  flow: "Parcours",
  doc_section: "Document · vue d'ensemble",
  component: "Composants",
  archflow: "Flux",
  adr: "Décisions",
};

const keyOf = (p: Fake): string => `${p.kind}:${p.zone}`;

/** Jusqu'à 30 propositions : un groupe par type (clé `feature`) ; au-delà, un groupe par type et zone. */
const isFlat = (items: Fake[]): boolean => items.length <= 30;
const groupKey = (p: Fake, flat: boolean): string => (flat ? p.kind : keyOf(p));

function groupsOf(items: Fake[]) {
  const flat = isFlat(items);
  const keys = [...new Set(items.map((p) => groupKey(p, flat)))];
  return keys.map((key) => {
    const own = items.filter((p) => groupKey(p, flat) === key);
    const n = (s: string) => own.filter((p) => p.status === s && !p.discardReason).length;
    const present = own.filter((p) => p.discardReason).length;
    return {
      key,
      label: flat
        ? (KIND_LABEL[key] ?? key)
        : `${KIND_LABEL[key.split(":")[0] ?? ""] ?? key} · ${key.split(":")[1]}`,
      total: own.length,
      accepted: n("accepted"),
      rejected: n("rejected"),
      pending: n("pending"),
      ...(present > 0 ? { alreadyPresent: present } : {}),
    };
  });
}

function listAnswer(input: Record<string, unknown>) {
  let items = store.items;
  const flat = isFlat(store.items);
  if (input.group) items = items.filter((p) => groupKey(p, flat) === input.group);
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
        ...(store.report === undefined ? {} : { report: store.report }),
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
export function serveProposals(
  items: Fake[],
  over: {
    launchStatus?: string;
    report?: unknown;
    failed?: FailedBatch;
    skip?: string[];
    /** Écartées comme déjà présentes à l'enregistrement (`outcome: "already_present"`, B698). */
    present?: string[];
  } = {},
): void {
  store.items = items;
  store.launchStatus = over.launchStatus ?? "done";
  store.report = over.report;
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
  procedures.specBatchSubmit.mockImplementation(async (input: SubmitInput) =>
    submitAnswer(input, over.skip ?? [], over.present ?? []),
  );
  procedures.specBatchGet.mockImplementation(async (input: { batchId: string }) =>
    over.failed?.id === input.batchId
      ? { ...over.failed }
      : { id: input.batchId, status: "committed", errorCode: null },
  );
}

/** Lot d'enregistrement échoué qui tient encore des acceptées (TK-114e, B673). */
export interface FailedBatch {
  id: string;
  status: "failed" | "conflict";
  errorCode: string | null;
}

interface SubmitInput {
  proposalIds: string[];
  operations: Array<{ kind: string }>;
  skipConflicts?: { proposals: string[] };
}

/**
 * `specBatch.submit` : avec `skipConflicts`, les propositions de `skip` sont écartées (`exists`), remises à relire ;
 * celles de `present` sont écartées comme déjà présentes (rejetées, `already_present`, B698) ; tout écarté : 409
 * `SPEC_BATCH_CONFLICT` `write_conflict` avec `skipped`, aucun lot (B672).
 */
function submitAnswer(input: SubmitInput, skip: readonly string[], present: readonly string[]) {
  const id = `0190cccc-0000-7000-8000-${String(procedures.specBatchSubmit.mock.calls.length).padStart(12, "0")}`;
  const owners = input.skipConflicts?.proposals ?? [];
  const skipped = input.operations.flatMap((op, position) => {
    const proposalId = owners[position];
    if (proposalId && present.includes(proposalId)) {
      return [
        {
          position,
          kind: op.kind,
          specId: null,
          reason: "exists",
          proposalId,
          outcome: "already_present",
        },
      ];
    }
    return proposalId && skip.includes(proposalId)
      ? [{ position, kind: op.kind, specId: null, reason: "exists", proposalId }]
      : [];
  });
  const returned = new Set(skipped.map((entry) => entry.proposalId));
  for (const p of store.items) {
    if (present.includes(p.id) && returned.has(p.id)) {
      Object.assign(p, {
        status: "rejected",
        discardReason: "already_present",
        appliedBatchId: null,
      });
    } else if (returned.has(p.id)) Object.assign(p, { status: "pending", appliedBatchId: null });
    else if (input.proposalIds.includes(p.id)) p.appliedBatchId = id;
  }
  if (returned.size > 0 && returned.size === input.proposalIds.length) {
    throw apiError("SPEC_BATCH_CONFLICT", { reason: "write_conflict", skipped });
  }
  return {
    id,
    status: "committed",
    errorCode: null,
    commitSha: "a".repeat(40),
    results: [],
    ...(skipped.length > 0 ? { skipped } : {}),
  };
}

export const renderTeam = (search = ""): ReturnType<typeof renderFeatures> => {
  serve("owner");
  return renderFeatures({ search });
};

export { PROJECT_ID };
