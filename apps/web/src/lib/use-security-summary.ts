"use client";

import type { IncidentContact } from "@koklo/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { describeAiError } from "./ai-errors.ts";
import { orpc } from "./orpc.ts";
import type { ProposalOutput } from "./proposal-types.ts";
import { ACTION_FAILED, SUMMARY_REJECTED } from "./security-labels.ts";
import { listInput, PROPOSAL_POLL_MS } from "./use-proposal-status.ts";
import type { SecurityPageModel } from "./use-security-page.ts";

/** Dernière proposition de résumé encore à relire (groupe `summary`), relue tant que le lancement tourne. */
function useSummaryProposal({ projectId, propose }: SecurityPageModel) {
  const { active } = propose.status;
  const query = useQuery({
    ...orpc.proposal.list.queryOptions({
      input: listInput(projectId, { group: "summary", status: "pending", limit: 1 }, "security"),
      refetchInterval: active ? PROPOSAL_POLL_MS : false,
    }),
    enabled: propose.enabled,
  });
  const proposal = (query.data?.items as ProposalOutput[] | undefined)?.find(
    (item) => item.kind === "summary" && item.status === "pending",
  );
  const { refetch } = query;
  // La fin d'un lancement fait arriver la proposition.
  useEffect(() => {
    if (propose.enabled && !active) void refetch();
  }, [active, propose.enabled, refetch]);
  return proposal;
}

/** « Mettre à jour avec l'agent » (`security.summary.propose`, B819), « Rejeter », et la proposition à relire. */
export function useSummaryAgent(page: SecurityPageModel) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.proposal.key() });
  const failed = (failure: unknown) => setError(describeAiError(failure).message || ACTION_FAILED);
  const propose = useMutation({
    ...orpc.security.summary.propose.mutationOptions(),
    onSuccess: refresh,
    onError: failed,
  });
  const decide = useMutation({
    ...orpc.proposal.decide.mutationOptions(),
    onSuccess: () => {
      page.announce(SUMMARY_REJECTED);
      return refresh();
    },
    onError: () => setError(ACTION_FAILED),
  });
  return {
    proposal: useSummaryProposal(page),
    error,
    asking: propose.isPending || page.propose.status.active,
    rejecting: decide.isPending,
    ask: () => {
      setError(null);
      propose.mutate({ projectId: page.projectId });
    },
    reject: (proposalId: string) => {
      setError(null);
      decide.mutate({ projectId: page.projectId, proposalId, decision: "reject" });
    },
  };
}

/** Résumé validé vu du client et du business (`clientSpace.security`). */
export function useClientSecurity(projectId: string) {
  return useQuery(orpc.clientSpace.security.queryOptions({ input: { projectId } }));
}

const PHONE = /^\+?[0-9][0-9 .()-]*$/;

/** Contrôle du contact, comme le contrat : nom sur une ligne, numéro de téléphone. */
export function contactIssues({ name, phone }: IncidentContact): Partial<IncidentContact> {
  return {
    ...(name.trim() ? {} : { name: "Obligatoire" }),
    ...(PHONE.test(phone.trim()) ? {} : { phone: "Un numéro de téléphone est attendu." }),
  };
}

/** Enregistrement du contact par le client (`clientSpace.securityContactSet`, B801). */
export function useContactSave(onSaved: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    ...orpc.clientSpace.securityContactSet.mutationOptions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.clientSpace.key() });
      onSaved();
    },
    onError: () => undefined,
  });
}
