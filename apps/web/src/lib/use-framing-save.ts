"use client";

import type { Role, SpecBatchSubmitInput } from "@koklo/contract";
import { useEffect, useMemo } from "react";
import { describeSaveError } from "./feature-errors.ts";
import { SLOW_TEXT } from "./features-region.ts";
import { IDS, proposalCardId } from "./framing-ids.ts";
import { BATCH_TITLE, batchTitle, createdText, SAVING_TEXT } from "./framing-labels.ts";
import { acceptedOperations } from "./framing-operations.ts";
import type { FramingProposal } from "./framing-types.ts";
import {
  type FeatureWrite,
  useFeatureWrite,
  WRITTEN_PHASES,
  type WriteMeta,
} from "./use-feature-submit.ts";
import type { SpecGate } from "./use-framing-access.ts";
import { afterSave } from "./use-framing-proposals.ts";
import type { Change } from "./use-framing-state.ts";
import type { ViewModel } from "./use-framing-view.ts";
import { usePendingResume } from "./use-pending-save.ts";

type Operations = SpecBatchSubmitInput["operations"];
const OPERATION = /^\/operations\/(\d+)(?:\/|$)/;

/** Ce qui remplace la barre d'enregistrement : le designer (permanent) ou la spec pas prête. */
type SaveBlock = "designer" | "spec" | null;

/** Un lot de cadrage : création dont le titre est « N fonctionnalité(s) » (aussi à la reprise au rechargement). */
const isFramingBatch = (meta: WriteMeta | null): boolean =>
  meta?.kind === "create" && BATCH_TITLE.test(meta.title);

interface SaveOptions {
  projectId: string;
  role: Role | undefined;
  spec: SpecGate;
  accepted: FramingProposal[];
  change: Change;
  view: ViewModel;
}

/** Opération désignée par le rapport d'un lot refusé : son rang (à partir de 0) et le motif, ou `null`. */
function designatedFailure(
  report: { issues: ReadonlyArray<{ pointer: string; message: string }> } | undefined,
): { index: number; message: string } | null {
  for (const issue of report?.issues ?? []) {
    const match = OPERATION.exec(issue.pointer);
    if (match) return { index: Number(match[1]), message: issue.message };
  }
  return null;
}

/** Envoi du lot : un seul `specBatch.submit`, jamais sans spec lue ni sans acceptée valide. */
function useBatchSubmit(options: SaveOptions, write: FeatureWrite, operations: Operations) {
  const { projectId, spec, view } = options;
  const block = saveBlockOf(options.role, spec);
  return () => {
    if (spec.kind !== "ready" || block || operations.length === 0) return;
    const { branch } = spec;
    view.patch({ confirming: false });
    write.submit({
      build: (idempotencyKey) => ({ projectId, idempotencyKey, branch, operations }),
      snapshot: JSON.stringify(operations),
      meta: {
        owner: 0,
        kind: "create",
        title: batchTitle(operations.length),
        status: "brouillon",
        priority: "",
        target: "framing",
      },
    });
  };
}

const saveBlockOf = (role: Role | undefined, spec: SpecGate): SaveBlock => {
  if (role === "designer") return "designer";
  return spec.kind === "ready" ? null : "spec";
};

/** Issue du lot : succès (acceptées retirées, rejetées jetées, focus sur le titre), échec (désigné ou non). */
function useBatchOutcome({ role, accepted, change, view }: SaveOptions, write: FeatureWrite) {
  const { patch, focusOn } = view;
  const framing = isFramingBatch(write.meta);
  const written = framing && WRITTEN_PHASES.includes(write.phase);
  // biome-ignore lint/correctness/useExhaustiveDependencies: une seule fois par enregistrement réussi
  useEffect(() => {
    if (!written) return;
    change((current) => ({ proposals: afterSave(current.proposals) }));
    patch({ confirming: false, notice: "" });
    focusOn(IDS.title);
  }, [written]);

  const failed = framing && write.phase === "failed" ? write.failure : null;
  const failure = useMemo(() => {
    if (!failed) return null;
    const described = describeSaveError(failed, { role, mode: "create" });
    const found = designatedFailure(described.report);
    const target = found ? accepted[found.index] : undefined;
    const designated =
      found && target ? { ...found, id: target.id, position: found.index + 1 } : null;
    return { view: described, designated };
  }, [failed, role, accepted]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: le focus suit l'échec, pas chaque rendu
  useEffect(() => {
    if (failure?.designated) focusOn(proposalCardId(failure.designated.id));
  }, [failure?.designated?.id]);

  const sending = framing && ["sending", "tracking"].includes(write.phase);
  let statusText = "";
  if (sending) statusText = write.slow ? SLOW_TEXT : SAVING_TEXT;
  else if (written && write.meta) statusText = createdText(write.meta.title);
  return { written, failure, statusText };
}

/**
 * Enregistrement des propositions acceptées : un seul `specBatch.submit`, après le récapitulatif, avec le suivi,
 * la clé d'idempotence et la reprise de l'enregistrement des fonctionnalités (S-framing §3.6, §3.7).
 */
export function useFramingSave(options: SaveOptions) {
  const { projectId, role, spec, accepted } = options;
  const write = useFeatureWrite({ projectId, filters: () => ({}) });
  usePendingResume(projectId, role, write);
  const operations = useMemo(() => acceptedOperations(accepted), [accepted]);
  const outcome = useBatchOutcome(options, write);
  return {
    write,
    block: saveBlockOf(role, spec),
    submit: useBatchSubmit(options, write, operations),
    busy: write.busy,
    count: operations.length,
    ...outcome,
  };
}
