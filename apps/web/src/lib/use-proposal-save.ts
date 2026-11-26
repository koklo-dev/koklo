"use client";

import type { SpecBatchOutput } from "@koklo/contract";
import type { ProposalSaveProgress } from "@koklo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { errorCode, errorData } from "./api-error.ts";
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
  /** Motif de chaque proposition écartée par la vérification de la spec et remise à relire (B672). */
  returned: string[];
  /** Propositions écartées parce que déjà présentes dans la spec : rejetées par le serveur, ni enregistrées ni remises à relire (B703). */
  present: number;
}

type Skipped = NonNullable<SpecBatchOutput["skipped"]>;
interface PlanOutcome {
  code: string | null;
  skipped: Skipped;
}

/**
 * Un motif par proposition remise à relire (toutes les opérations d'une proposition partent ensemble) et le nombre
 * de déjà présentes ; `outcome` absent vaut remise à relire (serveur antérieur à 3.16.0).
 */
function reasonsOf(skipped: Skipped): { returned: string[]; present: number } {
  const byProposal = new Map<string, Skipped[number]>();
  for (const entry of skipped) byProposal.set(entry.proposalId, entry);
  const entries = [...byProposal.values()];
  const present = entries.filter((entry) => entry.outcome === "already_present").length;
  const returned = entries.filter((entry) => entry.outcome !== "already_present");
  return { returned: returned.map((entry) => entry.reason), present };
}

/** 409 `SPEC_BATCH_CONFLICT` avec `skipped` : tout a été écarté et remis à relire, aucun lot (B672). */
function allSkipped(error: unknown): Skipped | null {
  if (errorCode(error) !== "SPEC_BATCH_CONFLICT") return null;
  const skipped = errorData(error)?.skipped;
  return Array.isArray(skipped) && skipped.length > 0 ? (skipped as Skipped) : null;
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
 * Envoie les lots l'un après l'autre et publie l'avancement avant chacun ; un lot en échec arrête la suite. Les
 * écartées ne comptent pas comme enregistrées.
 */
async function runPlans(
  plans: BatchPlan[],
  runPlan: (plan: BatchPlan) => Promise<PlanOutcome>,
  onProgress: (progress: ProposalSaveProgress) => void,
) {
  const total = plans.reduce((sum, plan) => sum + plan.proposalIds.length, 0);
  const batches = plans.length;
  let done = 0;
  let code: string | null = null;
  const returned: string[] = [];
  let present = 0;
  for (const [index, plan] of plans.entries()) {
    onProgress({ saved: done, sending: plan.proposalIds.length, total, batch: index + 1, batches });
    const outcome = await runPlan(plan);
    code = outcome.code;
    if (code) break;
    done += plan.proposalIds.length;
    const reasons = reasonsOf(outcome.skipped);
    returned.push(...reasons.returned);
    present += reasons.present;
  }
  onProgress({ saved: done, sending: 0, total, batch: batches, batches });
  return { saved: done - returned.length - present, left: total - done, code, returned, present };
}

/** Entrée de `specBatch.submit` : toujours `skipConflicts`, les conflits avec la tête sont écartés (B671, B675). */
const submitInput = (projectId: string, branch: string | undefined, plan: BatchPlan) => ({
  projectId,
  idempotencyKey: plan.key,
  ...(branch ? { branch } : {}),
  operations: plan.operations,
  proposalIds: plan.proposalIds,
  skipConflicts: { proposals: plan.operationProposals },
});

/**
 * Enregistrement des propositions acceptées : un seul `specBatch.submit` jusqu'à 200, sinon un commit par groupe,
 * l'un après l'autre. Rien n'est écrit sans appel explicite ; un lot en échec arrête la suite (« M à reprendre »).
 */
export function useProposalSave(options: { projectId: string; branch: string | undefined }) {
  const { projectId, branch } = options;
  const submit = useMutation(orpc.specBatch.submit.mutationOptions());
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<ProposalSaveProgress | undefined>(undefined);
  const busy = useRef(false);

  const runPlan = useCallback(
    async (plan: BatchPlan): Promise<PlanOutcome> => {
      try {
        const batch = await submit.mutateAsync(submitInput(projectId, branch, plan));
        const done = await follow(projectId, batch);
        const code = done.status === "committed" ? null : (done.errorCode ?? done.status);
        return { code, skipped: batch.skipped ?? [] };
      } catch (error) {
        const skipped = allSkipped(error);
        return skipped
          ? { code: null, skipped }
          : { code: errorCode(error) ?? "ERROR", skipped: [] };
      }
    },
    [branch, projectId, submit],
  );

  /** `retryOf` : lots échoués rejoués (clé de réessai `-r<empreinte>`, B673). */
  const save = useCallback(
    async (
      launchId: string,
      proposals: ProposalOutput[],
      retryOf: readonly string[] = [],
    ): Promise<SaveResult | null> => {
      if (busy.current) return null;
      const failed = new Set(retryOf);
      const savable = proposals.filter((p) => isSavable(p, failed));
      const plans = planBatches(launchId, savable, undefined, retryOf);
      if (plans.length === 0) return null;
      busy.current = true;
      setSaving(true);
      const result = await runPlans(plans, runPlan, setProgress);
      await queryClient.invalidateQueries({ queryKey: orpc.proposal.key() });
      await queryClient.invalidateQueries({ queryKey: orpc.spec.key() });
      busy.current = false;
      setSaving(false);
      setProgress(undefined);
      return result;
    },
    [queryClient, runPlan],
  );
  return { saving, progress, save };
}
