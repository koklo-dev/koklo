"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { orpc } from "./orpc.ts";
import { useBatchTracking } from "./use-batch-tracking.ts";

export type PublishState =
  | { kind: "idle" }
  | { kind: "publishing" }
  | { kind: "slow" }
  | { kind: "published"; sha: string }
  | { kind: "failed" };

/**
 * « Enregistrer une version » : envoie d'abord ce qui attend, puis crée le lot (`idea.publish`) et le suit
 * (`specBatch.get`). La clé d'idempotence est gardée tant que le lot n'est pas terminé : « Réessayer » ne duplique rien.
 */
export function useIdeaPublish(projectId: string, beforePublish: () => Promise<void>) {
  const client = useQueryClient();
  const [state, setState] = useState<PublishState>({ kind: "idle" });
  const [batchId, setBatchId] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  const publish = useCallback(async () => {
    setState({ kind: "publishing" });
    try {
      await beforePublish();
      key.current ??= `idea-${crypto.randomUUID()}`;
      const result = await orpc.idea.publish.call({ projectId, idempotencyKey: key.current });
      setBatchId(result.batchId);
    } catch {
      setState({ kind: "failed" });
    }
  }, [beforePublish, projectId]);

  useBatchTracking({
    projectId,
    batchId,
    active: state.kind === "publishing" && batchId !== null,
    eager: false,
    onBatch: (batch) => {
      if (batch.status === "committed") {
        key.current = null;
        setState({ kind: "published", sha: (batch.commitSha ?? "").slice(0, 7) });
        void client.invalidateQueries({
          queryKey: orpc.idea.list.queryOptions({ input: { projectId } }).queryKey,
        });
      } else if (batch.status === "failed" || batch.status === "conflict") {
        key.current = null;
        setState({ kind: "failed" });
      }
    },
    onSlow: () => setState({ kind: "slow" }),
    onError: () => undefined,
  });

  return { state, publish, dismiss: () => setState({ kind: "idle" }) };
}
