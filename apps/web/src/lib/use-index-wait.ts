"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { INDEX_LIMIT_MS, INDEX_POLL_MS } from "./feature-tracking.ts";
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
  onCaughtUp: (head: Head) => void;
  /** 30 s sans rattrapage : pas une erreur, la liste se mettra à jour. */
  onLate: () => void;
}

/** Relit `spec.head` toutes les 2 s, 30 s au plus, jusqu'à ce que l'index ait rattrapé la version écrite. */
export function useIndexWait(options: IndexWaitOptions): void {
  const { projectId, active, commitSha } = options;
  const queryClient = useQueryClient();
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!active || !commitSha) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(deadline);
    };
    const deadline = setTimeout(() => {
      stop();
      latest.current.onLate();
    }, INDEX_LIMIT_MS);

    async function check(): Promise<void> {
      if (stopped) return;
      try {
        const head = await queryClient.fetchQuery(
          orpc.spec.head.queryOptions({ input: { projectId } }),
        );
        if (!stopped && head && head.commitSha === commitSha) {
          stop();
          return latest.current.onCaughtUp(head);
        }
      } catch {
        // lecture manquée : on réessaie jusqu'à la borne
      }
      if (!stopped) timer = setTimeout(() => void check(), INDEX_POLL_MS);
    }
    void check();
    return stop;
  }, [active, commitSha, projectId, queryClient]);
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
