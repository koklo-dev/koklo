"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { orpc } from "./orpc.ts";
import { isArchitectureUpdate } from "./proposal-architecture.ts";
import type { ProposalOutput } from "./proposal-types.ts";
import { listAll } from "./use-proposal-savable.ts";
import type { ProposalCounts } from "./use-proposal-status.ts";

/**
 * Composant que le lancement propose d'ajouter à la spec (B711, B713) : une création, pas écartée comme déjà présente,
 * pas encore enregistrée (ou tenue par un lot échoué de `failed`). Une rejetée en est une : elle garde sa ligne.
 */
export const isProposedComponent = (
  proposal: ProposalOutput,
  failed: ReadonlySet<string>,
): boolean =>
  proposal.kind === "component" &&
  !isArchitectureUpdate(proposal) &&
  !proposal.discardReason &&
  (proposal.appliedBatchId === null || failed.has(proposal.appliedBatchId));

/** Ce que le compteur « Composants » ajoute à la spec : les composants proposés à relire ou acceptés. */
export const countProposedComponents = (
  proposals: readonly ProposalOutput[],
  failed: ReadonlySet<string>,
): number =>
  proposals.filter((p) => p.status !== "rejected" && isProposedComponent(p, failed)).length;

interface ProposedInput {
  reviewing: boolean;
  status: { launch: { id: string } | null; counts: ProposalCounts };
  /** Lots d'enregistrement échoués (`review.failed`). */
  failed: ReadonlySet<string>;
}

/**
 * Compte des composants proposés pendant la relecture (B712) : toutes les propositions `component` du lancement, relues
 * quand les comptes changent ou après une décision ou un enregistrement. Hors relecture, en cours ou en échec : 0.
 */
export function useArchitectureProposed(
  projectId: string,
  { reviewing, status, failed }: ProposedInput,
): number {
  const launchId = status.launch?.id;
  const { total, accepted, rejected, pending, present } = status.counts;
  const enabled = reviewing && launchId !== undefined && total > 0;
  const query = useQuery({
    queryKey: [
      ...orpc.proposal.key(),
      "architecture-proposed",
      projectId,
      launchId,
      total,
      accepted,
      rejected,
      pending,
      present,
    ],
    queryFn: () => listAll(projectId, "architecture", "component"),
    placeholderData: keepPreviousData,
    enabled,
  });
  if (!enabled || query.isError) return 0;
  // La lecture précédente reste affichée pendant la suivante, jamais celle d'un autre lancement.
  const own = (query.data ?? []).filter((proposal) => proposal.launchId === launchId);
  return countProposedComponents(own, failed);
}
