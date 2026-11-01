"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { orpc } from "./orpc.ts";

interface Head {
  commitSha: string;
  status: string;
}
interface IndexWaitOptions {
  projectId: string;
  active: boolean;
  /** Version écrite : l'index la rattrape quand `spec.head.commitSha` lui devient égal. */
  commitSha: string | null;
  /** Délai entre deux relectures, et durée au bout de laquelle on s'arrête. */
  pollMs: number;
  limitMs: number;
  /** Suspend les relectures tant que l'onglet est masqué. */
  pauseHidden?: boolean;
  onCaughtUp: (head: Head) => void;
  /** Borne atteinte sans rattrapage : pas une erreur, la liste se mettra à jour. */
  onLate?: () => void;
}

/** Une fenêtre d'attente : relectures à intervalle fixe jusqu'au rattrapage ou à la borne. */
function createIndexPoller(
  read: () => Promise<Head | null>,
  commitSha: string,
  options: () => IndexWaitOptions,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(deadline);
  };
  const deadline = setTimeout(() => {
    stop();
    options().onLate?.();
  }, options().limitMs);

  async function check(): Promise<void> {
    if (stopped) return;
    const { pauseHidden, pollMs, onCaughtUp } = options();
    if (!(pauseHidden && document.visibilityState === "hidden")) {
      try {
        const head = await read();
        if (!stopped && head && head.commitSha === commitSha) {
          stop();
          return onCaughtUp(head);
        }
      } catch {
        // lecture manquée : on réessaie jusqu'à la borne
      }
    }
    if (!stopped) timer = setTimeout(() => void check(), pollMs);
  }
  void check();
  return stop;
}

/** Relit `spec.head` à intervalle borné jusqu'à ce que l'index ait rattrapé la version écrite. */
export function useIndexWait(options: IndexWaitOptions): void {
  const { projectId, active, commitSha, pollMs, limitMs } = options;
  const queryClient = useQueryClient();
  const latest = useRef(options);
  latest.current = options;

  // biome-ignore lint/correctness/useExhaustiveDependencies: la fenêtre dépend des bornes, pas des rappels
  useEffect(() => {
    if (!active || !commitSha) return;
    return createIndexPoller(
      () => queryClient.fetchQuery(orpc.spec.head.queryOptions({ input: { projectId } })),
      commitSha,
      () => latest.current,
    );
  }, [active, commitSha, projectId, pollMs, limitMs, queryClient]);
}

/** Où la ligne enregistrée apparaît après la relecture de la liste. */
export type Placement = "row" | "filtered" | "more" | "none";

interface ListPage {
  items: { specId: string }[];
  nextCursor: string | null;
}
interface Saved {
  specId?: string | undefined;
  status: string;
  priority: string;
}
interface Filters {
  status?: string | undefined;
  priority?: string | undefined;
}

/** Relit la liste depuis le début (filtres gardés) et dit où se trouve la ligne enregistrée. */
export async function reloadList(
  queryClient: QueryClient,
  saved: Saved,
  filters: Filters,
  indexFailed: boolean,
): Promise<Placement> {
  if (indexFailed) return "none";
  const queryKey = orpc.spec.listFeatures.key();
  await queryClient.resetQueries({ queryKey });
  const query = queryClient.getQueryCache().findAll({ queryKey, type: "active" })[0];
  const pages = (query?.state.data as { pages: ListPage[] } | undefined)?.pages ?? [];
  if (pages.some((page) => page.items.some((item) => item.specId === saved.specId))) return "row";
  const visible =
    (!filters.status || filters.status === saved.status) &&
    (!filters.priority || filters.priority === saved.priority);
  if (!visible) return "filtered";
  return pages.at(-1)?.nextCursor ? "more" : "none";
}
