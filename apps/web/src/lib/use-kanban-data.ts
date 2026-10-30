"use client";

import type { TicketOutput } from "@koklo/contract";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { errorCode } from "./api-error.ts";
import { groupByStatus, type KanbanColumns } from "./kanban-board.ts";
import { orpc } from "./orpc.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

export type KanbanData =
  | { status: "loading" | "error" | "no-sprint" | "no-project" }
  | {
      status: "ready";
      sprintKey: string;
      goal: string;
      total: number;
      columns: KanbanColumns;
      tickets: readonly TicketOutput[];
    };

const PAGE_SIZE = 100;

interface Sources {
  sprints: { data?: readonly { key: string; goal: string }[]; error: unknown; isError: boolean };
  tickets: {
    data?: { pages: readonly { items: readonly TicketOutput[] }[] };
    error: unknown;
    isError: boolean;
  };
  hasNextPage: boolean;
  redirecting: boolean;
}

function failed(error: unknown, { sprints, redirecting }: Sources): KanbanData {
  if (errorCode(error) === "NOT_FOUND" && !sprints.data) return { status: "no-project" };
  return { status: redirecting ? "loading" : "error" };
}

/** Ramène les deux requêtes (sprint actif, tickets) à l'un des états de l'écran. */
function deriveKanbanData(sources: Sources): KanbanData {
  const { sprints, tickets, hasNextPage } = sources;
  const sprint = sprints.data?.[0];
  if (sprints.isError && !sprints.data) return failed(sprints.error, sources);
  if (sprints.data && !sprint) return { status: "no-sprint" };
  if (!sprint) return { status: "loading" };
  if (tickets.isError && !tickets.data) return failed(tickets.error, sources);
  if (!tickets.data || hasNextPage) return { status: "loading" };
  const all = tickets.data.pages.flatMap((page) => page.items);
  return {
    status: "ready",
    sprintKey: sprint.key,
    goal: sprint.goal,
    total: all.length,
    columns: groupByStatus(all),
    tickets: all,
  };
}

/** Sprint actif puis ses tickets (toutes les pages), ramenés à l'un des états de l'écran. */
export function useKanbanData() {
  const queryClient = useQueryClient();
  const sprints = useQuery(orpc.sprint.list.queryOptions({ input: { status: "active" } }));
  const sprint = sprints.data?.[0];
  const sprintKey = sprint?.key ?? "";
  const tickets = useInfiniteQuery({
    ...orpc.ticket.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        sprintId: sprintKey,
        limit: PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
    enabled: sprint !== undefined,
  });
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = tickets;
  // Le nombre de pages relance l'effet : sans lui, deux pages successives avec un curseur ne le changent pas.
  const pageCount = tickets.data?.pages.length ?? 0;
  useEffect(() => {
    if (pageCount > 0 && hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [pageCount, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const redirecting = useUnauthorizedRedirect(sprints.error ?? tickets.error);
  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: orpc.ticket.key() }),
    [queryClient],
  );
  const retry = () => void (sprints.isError ? sprints.refetch() : tickets.refetch());

  const data = deriveKanbanData({ sprints, tickets, hasNextPage, redirecting });
  return { data, reload, retry };
}
