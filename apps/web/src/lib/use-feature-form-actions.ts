"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { MutableRefObject } from "react";
import { clearDraft } from "./feature-draft.ts";
import {
  EMPTY_VALUES,
  type FeatureFormValues,
  type FieldKey,
  valuesFromDetail,
} from "./feature-form.ts";
import {
  collectIssues,
  type FormArgs,
  type FormState,
  type ResumeKey,
  type SetFormState,
} from "./feature-form-state.ts";
import {
  buildCreateOperation,
  buildSubmitInput,
  buildUpdateOperation,
} from "./feature-operation.ts";
import { rebase } from "./feature-rebase.ts";
import { orpc } from "./orpc.ts";
import { useFeatureDelete } from "./use-feature-delete.ts";

interface ActionContext {
  args: FormArgs;
  state: FormState;
  setState: SetFormState;
  resumeKey: MutableRefObject<ResumeKey | undefined>;
  flushDraft: () => boolean;
}

/** Envoi d'une seule opération : validation, patch minimal, clé d'idempotence (S-feature-form §5.2). */
export function useFormSave({ args, state, setState, resumeKey, flushDraft }: ActionContext) {
  const { projectId, mode, specId, head, write, owner } = args;
  const target = specId ?? "new";

  const send = (): void => {
    const operation =
      mode === "create"
        ? buildCreateOperation(state.values)
        : specId && state.baseline
          ? buildUpdateOperation(specId, state.baseline, state.values)
          : null;
    if (!operation) return;
    const { baseSha, values } = state;
    write.submit({
      build: (idempotencyKey) =>
        buildSubmitInput(
          { projectId, idempotencyKey, branch: head.branch, ...(baseSha ? { baseSha } : {}) },
          operation,
        ),
      snapshot: JSON.stringify([values, baseSha]),
      resume: resumeKey.current,
      meta: {
        owner,
        kind: mode === "create" ? "create" : "update",
        specId,
        title: values.title.trim(),
        status: values.status,
        priority: values.priority,
        target,
      },
    });
    resumeKey.current = undefined;
    flushDraft();
  };

  return () => {
    if (write.busy) return;
    const attempt = state.submitted + 1;
    setState((s) => ({ ...s, submitted: attempt }));
    write.dismiss();
    if (collectIssues({ ...state, submitted: attempt }, args).length === 0) send();
  };
}

/**
 * Actions d'écriture du formulaire : enregistrer, supprimer et « Réessayer » (qui renvoie la suppression ou
 * l'enregistrement qui a échoué, sans redemander confirmation).
 */
export function useWriteActions(context: ActionContext, mine: boolean) {
  const { args, state } = context;
  const del = useFeatureDelete(args, state, mine);
  const send = useFormSave(context);
  return {
    del,
    save: (): void => {
      del.clearRefusal();
      send();
    },
    retry: (): void => (mine && args.write.meta?.kind === "delete" ? del.confirm() : send()),
  };
}

/** Recharger la version actuelle après un conflit : comparaison à trois (§5.8). */
export function useReload({ args, state, setState }: ActionContext) {
  const queryClient = useQueryClient();
  const { projectId, specId, write } = args;
  return async (): Promise<void> => {
    if (!specId || !state.baseline) return;
    const reads = await Promise.all([
      queryClient.fetchQuery(orpc.spec.head.queryOptions({ input: { projectId } })),
      queryClient.fetchQuery(orpc.spec.getFeature.queryOptions({ input: { projectId, specId } })),
    ]).catch(() => null);
    // Lecture refusée (par exemple fonctionnalité déjà supprimée) : le panneau affiche l'erreur de la lecture.
    if (!reads) return;
    const [latestHead, latest] = reads;
    const current = valuesFromDetail(latest);
    const merged = rebase(state.baseline, state.values, current);
    const baseSha = latestHead?.commitSha ?? latest.commitSha;
    write.dismiss();
    setState((s) => ({
      ...s,
      ...merged,
      current,
      baseCommitSha: latest.commitSha,
      baseSha,
      unchangedReloads: baseSha === s.baseSha ? s.unchangedReloads + 1 : 0,
      banner: null,
    }));
  };
}

/** Brouillon repris : le garder malgré une version plus récente, l'abandonner, reprendre une valeur actuelle. */
export function useDraftChoices({ args, state, setState, resumeKey }: ActionContext) {
  const { projectId, specId, detail, announce } = args;

  const keepDraft = (): void => {
    if (!detail || !state.baseline) return;
    const current = valuesFromDetail(detail);
    const merged = rebase(state.baseline, state.values, current);
    setState((s) => ({
      ...s,
      ...merged,
      current,
      baseCommitSha: detail.commitSha,
      banner: null,
      confirming: false,
    }));
  };

  const abandon = (): void => {
    clearDraft(projectId, specId ?? "new");
    const current = detail ? valuesFromDetail(detail) : null;
    resumeKey.current = undefined;
    setState((s) => ({
      ...s,
      values: current ?? EMPTY_VALUES,
      baseline: current,
      baseCommitSha: detail?.commitSha ?? null,
      conflicts: [],
      current: null,
      banner: null,
      confirming: false,
      touched: [],
      submitted: 0,
    }));
    announce("Brouillon abandonné.");
  };

  const takeCurrent = (field: FieldKey): void => {
    const taken: FeatureFormValues | null = state.current;
    if (!taken) return;
    setState((s) => ({
      ...s,
      values: { ...s.values, [field]: taken[field] },
      conflicts: s.conflicts.filter((candidate) => candidate !== field),
    }));
  };

  return { keepDraft, abandon, takeCurrent };
}
