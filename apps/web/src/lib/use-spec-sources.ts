"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { orpc } from "./orpc.ts";
import { canReadRepos } from "./roles.ts";
import { useActiveOrganization } from "./use-active-organization.ts";
import { useSpecHead } from "./use-spec-head.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Relit les listes de `keys` quand la version indexée change (fin de préparation, nouvelle version). */
function useListRefresh(
  head: { status: string; commitSha: string } | null | undefined,
  keys: ReadonlyArray<() => readonly unknown[]>,
): void {
  const queryClient = useQueryClient();
  const previous = useRef<string | null>(null);
  const signature = head ? `${head.status}:${head.commitSha}` : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `keys` est constant pour un écran donné
  useEffect(() => {
    const before = previous.current;
    previous.current = signature;
    if (
      before !== null &&
      signature !== null &&
      before !== signature &&
      !before.startsWith("failed")
    ) {
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: key() });
    }
  }, [signature, queryClient]);
}

/**
 * Ce que tous les onglets du cahier lisent d'abord : session et rôle, projet, `spec.head` (relu pendant la
 * préparation) et, seulement s'il est vide et que le rôle le permet, `repo.list`.
 */
export function useSpecSources(
  projectId: string,
  listKeys: ReadonlyArray<() => readonly unknown[]>,
) {
  const valid = UUID.test(projectId);
  const { role, organizations, session } = useActiveOrganization();
  const project = useQuery(orpc.project.list.queryOptions());
  const pollEmpty = useRef(true);
  const head = useSpecHead(projectId, { enabled: valid, pollEmpty });
  const headData = head.query.data;
  const repos = useQuery({
    ...orpc.repo.list.queryOptions({ input: { projectId } }),
    enabled: valid && headData === null && canReadRepos(role),
  });
  // Une fois établi qu'aucun dépôt de spec n'existe, rien à attendre : on ne relit plus `spec.head`.
  pollEmpty.current = !(repos.data && !repos.data.some((repo) => repo.role === "spec"));
  useListRefresh(headData, listKeys);
  return {
    valid,
    role,
    roleKnown: !organizations.isPending && !session.isPending,
    projectName: project.data?.find((candidate) => candidate.id === projectId)?.name,
    head,
    headData,
    repos,
    /** `spec.head` lisible : les listes peuvent se charger. */
    readable: valid && Boolean(headData) && headData?.status !== "failed",
  };
}

export type SpecSources = ReturnType<typeof useSpecSources>;
