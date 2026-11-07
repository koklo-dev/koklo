"use client";

import type { TicketOutput, TicketStatus } from "@koklo/contract";
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";
import { STATUS_ORDER } from "./ticket-labels.ts";
import { useSingleFlight } from "./use-single-flight.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

/** Taille de la première page de chaque colonne et des suivantes (design/screens/S-kanban.md 1.2). */
export const COLUMN_PAGE_SIZE = 30;

export type ColumnFooter = "more" | "loading" | "error" | "end";

/** Une colonne du kanban : ses cartes chargées, son total selon le serveur, l'état de son pied. */
export interface ColumnData {
  tickets: readonly TicketOutput[];
  /** Nombre de tickets de la colonne selon le serveur, pas le nombre de cartes montées. */
  total: number;
  /** La première page de cette colonne n'a pas pu être lue (les autres colonnes ne sont pas touchées). */
  failed: boolean;
  /** Absent sous 30 cartes : une colonne courte n'a pas de pied. */
  footer: ColumnFooter | null;
  remaining: number;
  onLoadMore: () => void;
  onRetry: () => void;
}

export type KanbanColumns = Record<TicketStatus, ColumnData>;

export type KanbanData =
  | { status: "loading" | "error" | "no-sprint" | "no-project" }
  | {
      status: "ready";
      sprintKey: string;
      goal: string;
      /** Somme des totaux des colonnes. */
      total: number;
      columns: KanbanColumns;
      tickets: readonly TicketOutput[];
    };

type TicketPage = { items: TicketOutput[]; nextCursor: string | null; total: number };

/** Une requête par colonne : même clé pour la lecture, le rechargement et le total de l'annonce d'un déplacement. */
const columnOptions = (projectId: string, sprintKey: string, status: TicketStatus) =>
  orpc.ticket.list.infiniteOptions({
    input: (cursor: string | undefined) => ({
      projectId,
      sprintId: sprintKey,
      status,
      limit: COLUMN_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

function useColumn(projectId: string, sprintKey: string, status: TicketStatus, enabled: boolean) {
  const query = useInfiniteQuery({ ...columnOptions(projectId, sprintKey, status), enabled });
  const { fetchNextPage, hasNextPage } = query;
  const loadMore = useSingleFlight(
    useCallback(
      () => (hasNextPage ? fetchNextPage() : Promise.resolve()),
      [hasNextPage, fetchNextPage],
    ),
  );
  return { query, loadMore };
}

type ColumnQuery = ReturnType<typeof useColumn>;

function footerOf(query: ColumnQuery["query"], shown: number): ColumnFooter | null {
  if (query.isFetchingNextPage) return "loading";
  if (query.isFetchNextPageError) return "error";
  if (query.hasNextPage) return "more";
  return shown >= COLUMN_PAGE_SIZE ? "end" : null;
}

function columnOf({ query, loadMore }: ColumnQuery): ColumnData {
  const pages: TicketPage[] = query.data?.pages ?? [];
  const tickets = pages.flatMap((page) => page.items);
  const total = pages.at(-1)?.total ?? 0;
  return {
    tickets,
    total,
    failed: query.isError && query.data === undefined,
    footer: footerOf(query, tickets.length),
    remaining: Math.max(0, total - tickets.length),
    onLoadMore: loadMore,
    onRetry: query.isFetchNextPageError ? loadMore : () => void query.refetch(),
  };
}

interface Sources {
  sprints: { data?: readonly { key: string; goal: string }[]; error: unknown; isError: boolean };
  columns: KanbanColumns;
  /** Au moins une colonne n'a pas encore répondu. */
  pending: boolean;
  redirecting: boolean;
}

/** Projet de l'URL inconnu ou inaccessible (NOT_FOUND uniforme) : l'écran le dit ; autre échec : erreur, sauf redirection. */
function failed(error: unknown, { redirecting }: Sources): KanbanData {
  if (errorCode(error) === "NOT_FOUND") return { status: "no-project" };
  return { status: redirecting ? "loading" : "error" };
}

/** Ramène les requêtes (sprint actif, une par colonne) à l'un des états de l'écran. */
function deriveKanbanData(sources: Sources): KanbanData {
  const { sprints, columns, pending } = sources;
  const sprint = sprints.data?.[0];
  if (sprints.isError && !sprints.data) return failed(sprints.error, sources);
  if (sprints.data && !sprint) return { status: "no-sprint" };
  if (!sprint || pending) return { status: "loading" };
  const all = STATUS_ORDER.map((status) => columns[status]);
  // Toutes les colonnes en échec : l'écran entier est en erreur ; sinon chacune porte sa propre erreur.
  if (all.every((column) => column.failed))
    return { status: sources.redirecting ? "loading" : "error" };
  return {
    status: "ready",
    sprintKey: sprint.key,
    goal: sprint.goal,
    total: all.reduce((sum, column) => sum + column.total, 0),
    columns,
    tickets: all.flatMap((column) => column.tickets),
  };
}

/**
 * Sprint actif du projet de l'URL, puis une requête de 30 tickets par colonne : jamais le sprint entier.
 * Le projet vient de la route `/projects/<id>/tickets` ; un projet inaccessible répond NOT_FOUND au premier appel.
 */
export function useKanbanData(projectId: string) {
  const queryClient = useQueryClient();
  const sprints = useQuery(
    orpc.sprint.list.queryOptions({ input: { projectId, status: "active" } }),
  );
  const sprint = sprints.data?.[0];
  const sprintKey = sprint?.key ?? "";
  const enabled = sprint !== undefined;
  const queries = {
    backlog: useColumn(projectId, sprintKey, "backlog", enabled),
    todo: useColumn(projectId, sprintKey, "todo", enabled),
    in_progress: useColumn(projectId, sprintKey, "in_progress", enabled),
    in_review: useColumn(projectId, sprintKey, "in_review", enabled),
    blocked: useColumn(projectId, sprintKey, "blocked", enabled),
    done: useColumn(projectId, sprintKey, "done", enabled),
    cancelled: useColumn(projectId, sprintKey, "cancelled", enabled),
  } satisfies Record<TicketStatus, ColumnQuery>;
  const list = STATUS_ORDER.map((status) => queries[status]);

  const columns = Object.fromEntries(
    STATUS_ORDER.map((status) => [status, columnOf(queries[status])]),
  ) as KanbanColumns;
  const redirecting = useUnauthorizedRedirect(
    sprints.error ?? list.find((entry) => entry.query.error)?.query.error,
  );
  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: orpc.ticket.key() }),
    [queryClient],
  );
  /** Total d'une colonne tel que le serveur vient de le donner (annonce d'un déplacement). */
  const totalOf = useCallback(
    (status: TicketStatus): number | undefined =>
      queryClient.getQueryData<InfiniteData<TicketPage>>(
        columnOptions(projectId, sprintKey, status).queryKey,
      )?.pages[0]?.total,
    [queryClient, projectId, sprintKey],
  );
  const retry = () => {
    if (sprints.isError) void sprints.refetch();
    else for (const entry of list) if (entry.query.isError) void entry.query.refetch();
  };
  const pending = enabled && list.some((entry) => entry.query.isPending);
  return {
    data: deriveKanbanData({ sprints, columns, pending, redirecting }),
    reload,
    retry,
    totalOf,
  };
}
