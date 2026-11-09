"use client";

import { useToast } from "@koklo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { focusWhenReady } from "./idea-focus.ts";
import { orpc } from "./orpc.ts";
import { specPath } from "./shell-routes.ts";
import { useBatchTracking } from "./use-batch-tracking.ts";

export type FreezeState =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "freezing" }
  | { kind: "slow" }
  | { kind: "failed" };

/** Après l'arrivée sur Spec · Fonctionnel : le focus va au titre de la page (2.4.3). */
function focusSpecTitle(): void {
  focusWhenReady(() =>
    window.location.pathname.includes("/spec/")
      ? document.querySelector<HTMLElement>("[data-slot='project-header'] h1")
      : null,
  );
}

/**
 * « Passer au cadrage » : confirme s'il reste des questions ouvertes, envoie d'abord ce qui attend, puis crée le lot
 * (`idea.freeze`) et le suit (`specBatch.get`). La clé d'idempotence est gardée tant que le lot n'est pas terminé :
 * « Réessayer » ne duplique rien. Au commit : la phase du projet est relue, puis Spec · Fonctionnel s'ouvre.
 */
export function useIdeaFreeze(
  projectId: string,
  openQuestions: number,
  beforeFreeze: () => Promise<void>,
) {
  const client = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState<FreezeState>({ kind: "idle" });
  const [batch, setBatch] = useState<{ id: string; tag: string } | null>(null);
  const key = useRef<string | null>(null);

  const run = useCallback(async () => {
    setState({ kind: "freezing" });
    try {
      await beforeFreeze();
      key.current ??= `idea-freeze-${crypto.randomUUID()}`;
      const result = await orpc.idea.freeze.call({ projectId, idempotencyKey: key.current });
      setBatch({ id: result.batchId, tag: result.tag });
    } catch {
      setState({ kind: "failed" });
    }
  }, [beforeFreeze, projectId]);

  const request = useCallback(() => {
    if (openQuestions > 0) setState({ kind: "confirm" });
    else void run();
  }, [openQuestions, run]);

  useBatchTracking({
    projectId,
    batchId: batch?.id ?? null,
    active: state.kind === "freezing" && batch !== null,
    eager: false,
    onBatch: (tracked) => {
      if (tracked.status === "committed") {
        key.current = null;
        setState({ kind: "idle" });
        void client.invalidateQueries({
          queryKey: orpc.idea.list.queryOptions({ input: { projectId } }).queryKey,
        });
        void client.invalidateQueries({
          queryKey: orpc.project.shell.queryOptions({ input: { projectId } }).queryKey,
        });
        toast({ tone: "success", title: `Version ${batch?.tag} figée.` });
        router.push(specPath(projectId, "functional"));
        focusSpecTitle();
      } else if (tracked.status === "failed" || tracked.status === "conflict") {
        key.current = null;
        setState({ kind: "failed" });
      }
    },
    onSlow: () => setState({ kind: "slow" }),
    onError: () => undefined,
  });

  return {
    state,
    request,
    confirm: () => void run(),
    retry: () => void run(),
    cancel: () => setState({ kind: "idle" }),
  };
}
