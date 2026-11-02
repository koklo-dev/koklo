"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyDraft, isEmptyDraft } from "./framing-brief.ts";
import { clearFramingDraft, readFramingDraft, saveFramingDraft } from "./framing-draft.ts";
import type { FramingDraft } from "./framing-types.ts";
import { useBeginFeatureSession, useStorageScope } from "./use-storage-scope.ts";

/** Écriture du brouillon 300 ms après la dernière modification (le démontage écrit aussi, sauf session terminée). */
const FRAMING_DRAFT_DELAY_MS = 300;

export type FramingPatch = Partial<Omit<FramingDraft, "savedAt">>;
export type Change = (patch: FramingPatch | ((current: FramingDraft) => FramingPatch)) => void;

/**
 * Saisie de la session de cadrage et son brouillon local (S-framing §5.3) : lu une fois, quand le compte et
 * l'organisation sont connus ; écrit seulement si quelque chose est saisi, et jamais après la fin de session.
 * `restored` : date du brouillon repris (bandeau), `null` sinon.
 */
export function useFramingState(projectId: string, enabled: boolean) {
  const scope = useStorageScope();
  useBeginFeatureSession(scope);
  const [state, setState] = useState<FramingDraft>(emptyDraft);
  const [restored, setRestored] = useState<string | null>(null);
  const latest = useRef(state);
  latest.current = state;
  const touched = useRef(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!enabled || !scope || hydrated.current) return;
    hydrated.current = true;
    const draft = readFramingDraft(scope, projectId);
    if (!draft || !isEmptyDraft(latest.current)) return;
    setState(draft);
    setRestored(draft.savedAt);
  }, [enabled, scope, projectId]);

  const flush = useCallback(() => {
    if (!enabled) return;
    const current = latest.current;
    if (!isEmptyDraft(current)) saveFramingDraft(scope, projectId, current);
    else if (touched.current) clearFramingDraft(projectId);
  }, [enabled, scope, projectId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque modification de la saisie relance l'anti-rebond
  useEffect(() => {
    const timer = setTimeout(flush, FRAMING_DRAFT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, flush]);
  useEffect(() => flush, [flush]);

  const change: Change = useCallback((patch) => {
    touched.current = true;
    setState((current) => ({
      ...current,
      ...(typeof patch === "function" ? patch(current) : patch),
      savedAt: new Date().toISOString(),
    }));
  }, []);

  /** « Abandonner » : plus rien à l'écran ni sur l'appareil. */
  const discard = useCallback(() => {
    clearFramingDraft(projectId);
    touched.current = false;
    setState(emptyDraft());
    setRestored(null);
  }, [projectId]);

  return { state, change, restored, dismissRestored: () => setRestored(null), discard };
}
