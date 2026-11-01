"use client";

import { useCallback, useEffect, useRef } from "react";
import { clearDraft, saveDraft } from "./feature-draft.ts";
import { diffValues, EMPTY_VALUES, type FeatureFormValues } from "./feature-form.ts";

/** Écriture du brouillon 500 ms après la dernière frappe (S-feature-form §5.5). */
export const DRAFT_DELAY_MS = 500;

interface DraftOptions {
  projectId: string;
  /** `new` ou `F-nnn`. */
  target: string;
  values: FeatureFormValues;
  /** Valeurs lues à l'ouverture (`null` en création). */
  baseline: FeatureFormValues | null;
  baseCommitSha: string | null;
  /** Clé d'idempotence à garder avec le brouillon. */
  getKey: () => string | null;
  /** Faux une fois le lot écrit : le brouillon est supprimé et ne doit plus revenir. */
  enabled: boolean;
}

/**
 * Sauvegarde locale de la saisie, seulement si elle diffère de la référence (sinon le brouillon est supprimé).
 * `flush()` écrit tout de suite et dit si un brouillon existe ; l'écriture est aussi faite au démontage.
 */
export function useFeatureDraft(options: DraftOptions): { flush: () => boolean } {
  const latest = useRef(options);
  latest.current = options;

  const flush = useCallback((): boolean => {
    const { projectId, target, values, baseline, baseCommitSha, getKey, enabled } = latest.current;
    if (!enabled) return false;
    if (diffValues(baseline ?? EMPTY_VALUES, values).length === 0) {
      clearDraft(projectId, target);
      return false;
    }
    return saveDraft(projectId, target, {
      values,
      baseline,
      baseCommitSha,
      idempotencyKey: getKey(),
      savedAt: new Date().toISOString(),
    });
  }, []);

  const { values, baseline, baseCommitSha, enabled } = options;
  // biome-ignore lint/correctness/useExhaustiveDependencies: la saisie et la référence relancent l'anti-rebond
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(flush, DRAFT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [values, baseline, baseCommitSha, enabled, flush]);

  useEffect(
    () => () => {
      flush();
    },
    [flush],
  );
  return { flush };
}
