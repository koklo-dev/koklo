"use client";

import type { IdeaListOutput, IdeaPageSummary } from "@koklo/contract";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";
import { canPublishIdea, canWriteIdea } from "./roles.ts";
import { useActiveOrganization } from "./use-active-organization.ts";
import { useIdeaActions } from "./use-idea-actions.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

export type IdeaGate = "loading" | "not-found" | "error" | "ready";

function gateOf(list: ReturnType<typeof useIdeaList>): IdeaGate {
  if (list.isPending) return "loading";
  if (list.isError) return errorCode(list.error) === "NOT_FOUND" ? "not-found" : "error";
  return "ready";
}

function useIdeaList(projectId: string) {
  return useQuery(orpc.idea.list.queryOptions({ input: { projectId } }));
}

/** Page ouverte : `?page=<slug>`, sinon la première page du dossier. */
export function pickPage(
  pages: IdeaPageSummary[],
  slug: string | null,
): IdeaPageSummary | undefined {
  return pages.find((page) => page.slug === slug) ?? pages[0];
}

export function useIdeaPage(projectId: string) {
  const list = useIdeaList(projectId);
  const slug = useSearchParams().get("page");
  const { role } = useActiveOrganization();
  const actions = useIdeaActions(projectId);
  const unauthorized = useUnauthorizedRedirect(list.error);
  const data: IdeaListOutput | undefined = list.data;
  const pages = useMemo(
    () => [...(data?.pages ?? [])].sort((a, b) => a.position - b.position),
    [data],
  );
  const current = pickPage(pages, slug);
  return {
    projectId,
    gate: unauthorized ? ("loading" as const) : gateOf(list),
    refetch: () => void list.refetch(),
    pages,
    trash: data?.trash ?? [],
    publication: data?.publication ?? { available: false, last: null },
    slug,
    current,
    currentIndex: current ? pages.indexOf(current) : -1,
    canWrite: canWriteIdea(role),
    canPublish: canPublishIdea(role),
    actions,
  };
}

export type IdeaModel = ReturnType<typeof useIdeaPage>;
