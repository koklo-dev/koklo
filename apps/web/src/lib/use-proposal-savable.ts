"use client";

import { useQuery } from "@tanstack/react-query";
import { orpc } from "./orpc.ts";
import { type Cascade, prepareDataProposals, type TableRelation } from "./proposal-data.ts";
import type { Deliverable } from "./proposal-labels.ts";
import { isSavable } from "./proposal-operations.ts";
import type { ProposalOutput } from "./proposal-types.ts";
import { listInput } from "./use-proposal-status.ts";

/** Relations déjà écrites d'une table enregistrée : `table.update` les remplace, les nouvelles s'y ajoutent. */
async function savedRelations(projectId: string, specId: string): Promise<TableRelation[]> {
  try {
    const item = await orpc.spec.item.get.call({ projectId, type: "table", id: specId });
    return item.type === "table" ? item.values.relations : [];
  } catch {
    return [];
  }
}

export const NO_CASCADE: Cascade = { relations: 0, fields: 0 };
const FAILED_STATUSES: ReadonlySet<string> = new Set(["failed", "conflict"]);

/** Enregistrement échoué qui tient encore des acceptées (B668) : leur nombre, le motif, les lots à rejouer. */
export interface ProposalSaveFailure {
  count: number;
  /** Code du premier lot échoué (`write_conflict`, `SPEC_INVALID`, …), sinon son statut. */
  errorCode: string | null;
  batches: string[];
}

/** Toutes les propositions du lancement, page de 100 après page de 100. */
async function listAll(projectId: string, deliverable: Deliverable): Promise<ProposalOutput[]> {
  let all: ProposalOutput[] = [];
  let cursor: string | undefined;
  do {
    const page = await orpc.proposal.list.call(
      listInput(
        projectId,
        { status: "all", limit: 100, ...(cursor ? { cursor } : {}) },
        deliverable,
      ),
    );
    all = [...all, ...page.items];
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return all;
}

/** Lots échoués (`failed`, `conflict`) qui tiennent des acceptées de la liste complète, avec leur code. */
async function failedLocks(
  projectId: string,
  proposals: ProposalOutput[],
): Promise<Map<string, string | null>> {
  const ids = [
    ...new Set(
      proposals.flatMap((p) =>
        p.status === "accepted" && p.appliedBatchId ? [p.appliedBatchId] : [],
      ),
    ),
  ];
  const batches = await Promise.all(
    ids.map((batchId) => orpc.specBatch.get.call({ projectId, batchId }).catch(() => null)),
  );
  const failed = new Map<string, string | null>();
  batches.forEach((batch, index) => {
    const id = ids[index];
    if (id && batch && FAILED_STATUSES.has(batch.status))
      failed.set(id, batch.errorCode ?? batch.status);
  });
  return failed;
}

function failureOf(
  proposals: ProposalOutput[],
  failed: Map<string, string | null>,
): ProposalSaveFailure | null {
  const held = proposals.filter((p) => p.appliedBatchId !== null && failed.has(p.appliedBatchId));
  if (held.length === 0) return null;
  return {
    count: held.length,
    errorCode: [...failed.values()][0] ?? null,
    batches: [...failed.keys()],
  };
}

interface SavableSet {
  proposals: ProposalOutput[];
  cascade: Cascade;
  failed: ReadonlySet<string>;
  failure: ProposalSaveFailure | null;
}

/**
 * Toutes les acceptées pas encore enregistrées du lancement, ou tenues par un lot échoué (B673) : base du bouton
 * « Enregistrer » et de « Réessayer l'enregistrement ». Pour les Données, la cascade du rejet et le rattachement des
 * relations passent d'abord (B392).
 */
export function useSavable(
  projectId: string,
  launchId: string | undefined,
  accepted: number,
  deliverable: Deliverable,
) {
  const query = useQuery({
    queryKey: [...orpc.proposal.key(), "savable", projectId, launchId, accepted, deliverable],
    enabled: accepted > 0 && launchId !== undefined,
    queryFn: async (): Promise<SavableSet> => {
      const all = await listAll(projectId, deliverable);
      const locks = await failedLocks(projectId, all);
      const failed = new Set(locks.keys());
      const ready =
        deliverable === "data"
          ? await prepareDataProposals(all, (id) => savedRelations(projectId, id))
          : { proposals: all, cascade: NO_CASCADE };
      const proposals = ready.proposals.filter((p) => isSavable(p, failed));
      return { proposals, cascade: ready.cascade, failed, failure: failureOf(proposals, locks) };
    },
  });
  return query.data;
}
