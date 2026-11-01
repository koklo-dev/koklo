"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describeSaveError, type SaveFailure } from "./feature-errors.ts";
import {
  diffValues,
  type FeatureFormValues,
  isLinkField,
  valuesFromDetail,
} from "./feature-form.ts";
import { focusIdOf, topField } from "./feature-form-ids.ts";
import {
  collectIssues,
  type FormArgs,
  type FormState,
  initialState,
  type SetFormState,
  serverFields,
} from "./feature-form-state.ts";
import { useFeatureDelete } from "./use-feature-delete.ts";
import { useFeatureDraft } from "./use-feature-draft.ts";
import { useDraftChoices, useFormSave, useReload } from "./use-feature-form-actions.ts";
import { WRITTEN_PHASES } from "./use-feature-submit.ts";
import { useStorageScope } from "./use-storage-scope.ts";

export type { Banner, FormArgs } from "./feature-form-state.ts";

/** Demande de focus sur un élément du formulaire, appliquée après le rendu qui l'a (ré)ouvert. */
function useFocusRequests(criteriaCount: number, setState: SetFormState) {
  const [request, setRequest] = useState<{ id: string; nonce: number } | null>(null);
  useEffect(() => {
    if (request) document.getElementById(request.id)?.focus();
  }, [request]);
  const focusId = useCallback(
    (id: string) => setRequest((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 })),
    [],
  );
  const focusField = useCallback(
    (field: string) => {
      setState((s) => ({ ...s, linksOpen: s.linksOpen || isLinkField(topField(field)) }));
      focusId(focusIdOf(field, criteriaCount));
    },
    [criteriaCount, focusId, setState],
  );
  return { focusId, focusField };
}

/** Un échec marque les champs que le serveur désigne et garde la saisie (et sa clé) dans le brouillon. */
function useFailure(
  args: FormArgs,
  mine: boolean,
  refusal: SaveFailure | null,
  setState: SetFormState,
  flush: () => boolean,
) {
  const { write, role, mode } = args;
  const failure = refusal ?? (mine ? write.failure : null);
  const deleting = refusal !== null || write.meta?.kind === "delete";
  const view = useMemo(
    () =>
      failure
        ? describeSaveError(failure, {
            role,
            mode: deleting ? "delete" : mode === "create" ? "create" : "update",
          })
        : null,
    [failure, role, mode, deleting],
  );
  useEffect(() => {
    if (!view) return;
    const fields = serverFields(view);
    setState((s) => ({
      ...s,
      serverFields: fields,
      linksOpen: s.linksOpen || fields.some(isLinkField),
    }));
    flush();
  }, [view, setState, flush]);
  return view;
}

/** Saisie : valeurs, champs touchés, section « Éléments liés », confirmation d'abandon. */
function useFieldActions(setState: SetFormState) {
  const patch = (next: Partial<FormState>) => setState((s) => ({ ...s, ...next }));
  return {
    setValues: useCallback(
      (next: Partial<FeatureFormValues>) =>
        setState((s) => ({
          ...s,
          values: { ...s.values, ...next },
          serverFields: s.serverFields.filter((field) => !(field in next)),
        })),
      [setState],
    ),
    blur: (field: string) =>
      setState((s) => (s.touched.includes(field) ? s : { ...s, touched: [...s.touched, field] })),
    setLinksOpen: (linksOpen: boolean) => patch({ linksOpen }),
    ask: (confirming: boolean) => patch({ confirming }),
  };
}

/** Part d'état et actions du formulaire d'une fonctionnalité (création ou modification). */
export function useFeatureForm(args: FormArgs) {
  const { projectId, mode, specId, detail, write, owner } = args;
  const scope = useStorageScope();
  const [init] = useState(() =>
    initialState(args, detail ? valuesFromDetail(detail) : null, scope),
  );
  const [state, setState] = useState<FormState>(init.state);
  const resumeKey = useRef(init.resume);
  const mine = write.meta?.owner === owner;
  const draft = useFeatureDraft({
    scope,
    projectId,
    target: specId ?? "new",
    values: state.values,
    baseline: state.baseline,
    baseCommitSha: state.baseCommitSha,
    getKey: () => write.currentKey() ?? resumeKey.current?.key ?? null,
    enabled: !(mine && WRITTEN_PHASES.includes(write.phase)),
  });
  const context = { args, state, setState, resumeKey, flushDraft: draft.flush };
  const del = useFeatureDelete(args, state, mine);
  const save = useFormSave(context);
  const issues = collectIssues(state, args);
  const touched = (issue: { field: string }) => state.touched.includes(topField(issue.field));
  return {
    state,
    mine,
    failureView: useFailure(args, mine, del.refusal, setState, draft.flush),
    issues: state.submitted > 0 ? issues : issues.filter(touched),
    noChange:
      mode === "edit" &&
      state.baseline !== null &&
      diffValues(state.baseline, state.values).length === 0,
    awaitingChoice: state.banner?.kind === "changed",
    ...useFieldActions(setState),
    save: () => {
      del.clearRefusal();
      save();
    },
    /** « Réessayer » : renvoie la suppression ou l'enregistrement qui a échoué, sans redemander confirmation. */
    retry: () => (mine && write.meta?.kind === "delete" ? del.confirm() : save()),
    del,
    reload: useReload(context),
    ...useDraftChoices(context),
    ...useFocusRequests(state.values.criteria.length, setState),
    flushDraft: draft.flush,
  };
}

export type FeatureFormModel = ReturnType<typeof useFeatureForm>;
