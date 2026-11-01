"use client";

import { useEffect, useRef } from "react";
import { readPending } from "./feature-draft.ts";
import { canWriteSpec } from "./roles.ts";
import type { FeatureWrite } from "./use-feature-submit.ts";
import { useBeginFeatureSession, useStorageScope } from "./use-storage-scope.ts";

/**
 * Reprise du suivi au rechargement de la page (S-feature-form §5.7) : un marqueur local de ce projet, récent,
 * relance `specBatch.get` ; jamais un nouvel envoi. Seule l'équipe qui écrit en lit un. Commence par effacer ce qu'un
 * autre compte ou une autre organisation a laissé sur l'appareil.
 */
export function usePendingResume(
  projectId: string,
  role: string | undefined,
  write: FeatureWrite,
): void {
  const attempted = useRef(false);
  const scope = useStorageScope();
  useBeginFeatureSession(scope);
  const allowed = canWriteSpec(role) && scope !== null;
  const { resume } = write;
  useEffect(() => {
    if (!allowed || attempted.current) return;
    attempted.current = true;
    const pending = readPending(scope, projectId);
    if (pending) resume(pending);
  }, [allowed, scope, projectId, resume]);
}
