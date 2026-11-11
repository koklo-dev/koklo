"use client";

import type { SpecBatchOutput } from "@koklo/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { errorCode } from "./api-error.ts";
import { pollDelay, TRACKING_LIMIT_MS } from "./feature-tracking.ts";
import { orpc } from "./orpc.ts";
import { type BatchPlan, isSavable, planBatches } from "./proposal-operations.ts";
import type { ProposalOutput } from "./proposal-types.ts";

const TERMINAL = ["committed", "failed", "conflict"];
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SaveResult {
  saved: number;
  left: number;
  /** Code d'erreur de l'envoi interrompu (`UNAUTHORIZED`, `FORBIDDEN`, ...), sinon `null`. */
  code: string | null;
}

/** Relit le lot jusqu'à son état terminal (60 s au plus, comme le suivi d'une fonctionnalité). */
async function follow(projectId: string, batch: SpecBatchOutput): Promise<SpecBatchOutput> {
  let current = batch;
  const start = Date.now();
  for (let attempt = 0; !TERMINAL.includes(current.status); attempt += 1) {
    if (Date.now() - start > TRACKING_LIMIT_MS) break;
    await wait(pollDelay(attempt));
    current = await orpc.specBatch.get.call({ projectId, batchId: current.id });
  }
  return current;
}

/**
 * Enregistrement des propositions acceptées : un seul `specBatch.submit` jusqu'à 200, sinon un commit par groupe,
 * l'un après l'autre. Rien n'est écrit sans appel explicite ; un lot en échec arrête la suite (« M à reprendre »).
 */
export function useProposalSave(options: { projectId: string; branch: string | undefined }) {
  const { projectId, branch } = options;
  const submit = useMutation(orpc.specBatch.submit.mutationOptions());
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const runPlan = useCallback(
    async (plan: BatchPlan): Promise<string | null> => {
      try {
        const batch = await submit.mutateAsync({
          projectId,
          idempotencyKey: plan.key,
          ...(branch ? { branch } : {}),
          operations: plan.operations,
          proposalIds: plan.proposalIds,
        });
        const done = await follow(projectId, batch);
        return done.status === "committed" ? null : (done.errorCode ?? done.status);
      } catch (error) {
        return errorCode(error) ?? "ERROR";
      }
    },
    [branch, projectId, submit],
  );

  const save = useCallback(
    async (launchId: string, proposals: ProposalOutput[]): Promise<SaveResult | null> => {
      if (busy.current) return null;
      const plans = planBatches(launchId, proposals.filter(isSavable));
      if (plans.length === 0) return null;
      busy.current = true;
      setSaving(true);
      let saved = 0;
      let code: string | null = null;
      for (const plan of plans) {
        code = await runPlan(plan);
        if (code) break;
        saved += plan.proposalIds.length;
      }
      const total = plans.reduce((sum, plan) => sum + plan.proposalIds.length, 0);
      await queryClient.invalidateQueries({ queryKey: orpc.proposal.key() });
      await queryClient.invalidateQueries({ queryKey: orpc.spec.key() });
      busy.current = false;
      setSaving(false);
      return { saved, left: total - saved, code };
    },
    [queryClient, runPlan],
  );
  return { saving, save };
}
