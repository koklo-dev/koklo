"use client";

import { orpc } from "./orpc.ts";
import type { FeatureWrite } from "./use-feature-submit.ts";

const OWNER = 4_300;

/**
 * « Choisir <option> » (`spec.technical.stack.choose`, un lot d'une `stack.update`) : suivi comme tout enregistrement
 * (attente du lot, de l'index, relecture de la liste).
 */
export function useStackChoice(
  projectId: string,
  write: FeatureWrite,
  head: { branch: string; commitSha: string } | null,
) {
  return (id: string, option: string): void => {
    if (!head) return;
    write.submit({
      send: (idempotencyKey) =>
        orpc.spec.technical.stack.choose.call({
          projectId,
          id,
          option,
          idempotencyKey,
          branch: head.branch,
          baseSha: head.commitSha,
        }),
      snapshot: JSON.stringify(["choose", id, option, head.commitSha]),
      meta: {
        owner: OWNER,
        kind: "update",
        specId: id,
        title: option,
        status: "",
        priority: "",
        target: id,
      },
    });
  };
}
