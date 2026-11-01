"use client";

import { useEffect, useState } from "react";
import type { SaveFailure } from "./feature-errors.ts";
import { checkDesignerScreens } from "./feature-form.ts";
import { DELETE_TRIGGER_ID } from "./feature-form-ids.ts";
import type { FormArgs, FormState } from "./feature-form-state.ts";
import { buildDeleteOperation, buildSubmitInput } from "./feature-operation.ts";

/** Refus préalable du designer : même vue que le refus du serveur (le serveur reste l'autorité). */
const DESIGNER_REFUSAL: SaveFailure = { source: "submit", error: { code: "FORBIDDEN" } };

/**
 * Suppression d'une fonctionnalité depuis le panneau de modification (S-feature-form §4.8) : demande, annulation
 * (le focus revient sur le bouton d'entrée), contrôle préalable du designer et envoi de l'opération `feature.delete`
 * seule, avec la version lue (`baseSha`) et une clé d'idempotence propre à la suppression.
 */
export function useFeatureDelete(args: FormArgs, state: FormState, mine: boolean) {
  const { projectId, specId, head, role, write, owner } = args;
  const [asking, setAsking] = useState(false);
  const [returned, setReturned] = useState(0);
  const [refusal, setRefusal] = useState<SaveFailure | null>(null);

  useEffect(() => {
    if (returned > 0) document.getElementById(DELETE_TRIGGER_ID)?.focus();
  }, [returned]);

  const confirm = (): void => {
    if (write.busy || !specId || !state.baseline) return;
    write.dismiss();
    setAsking(false);
    const denied =
      role === "designer" && checkDesignerScreens("delete", state.baseline, state.values);
    setRefusal(denied ? DESIGNER_REFUSAL : null);
    if (denied) return;
    const baseSha = state.baseSha;
    write.submit({
      build: (idempotencyKey) =>
        buildSubmitInput(
          { projectId, idempotencyKey, branch: head.branch, ...(baseSha ? { baseSha } : {}) },
          buildDeleteOperation(specId),
        ),
      snapshot: JSON.stringify(["delete", specId, baseSha]),
      meta: {
        owner,
        kind: "delete",
        specId,
        title: state.baseline.title.trim(),
        status: "",
        priority: "",
        target: specId,
      },
    });
  };

  const deleting = mine && write.meta?.kind === "delete" && write.phase === "sending";
  return {
    refusal,
    clearRefusal: () => setRefusal(null),
    /** La confirmation remplace le pied tant qu'on la demande et pendant l'envoi de la suppression. */
    confirming: asking || deleting,
    deleting,
    ask: () => {
      setRefusal(null);
      setAsking(true);
    },
    keep: () => {
      setAsking(false);
      setReturned((count) => count + 1);
    },
    confirm,
  };
}

export type FeatureDelete = ReturnType<typeof useFeatureDelete>;
