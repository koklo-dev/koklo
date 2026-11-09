"use client";

import type { IdeaListOutput, IdeaPageSummary } from "@koklo/contract";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { errorCode } from "./api-error.ts";
import { SYNTHESIS_PAGE } from "./idea-labels.ts";
import { orpc } from "./orpc.ts";
import { canPublishIdea, canWriteIdea } from "./roles.ts";
import { useActiveOrganization } from "./use-active-organization.ts";
import { useIdeaActions } from "./use-idea-actions.ts";
import { useIdeaProposals } from "./use-idea-proposals.ts";
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
export function pickPage<T extends IdeaPageSummary>(
  pages: T[],
  slug: string | null,
): T | undefined {
  return pages.find((page) => page.slug === slug) ?? pages[0];
}

export function useIdeaPage(projectId: string) {
  const list = useIdeaList(projectId);
  const slug = useSearchParams().get("page");
  const { role } = useActiveOrganization();
  const actions = useIdeaActions(projectId);
  const decisions = useIdeaProposals(projectId);
  const unauthorized = useUnauthorizedRedirect(list.error);
  const data: IdeaListOutput | undefined = list.data;
  const pages = useMemo(
    () => [...(data?.pages ?? [])].sort((a, b) => a.position - b.position),
    [data],
  );
  const synthesisOpen = slug === SYNTHESIS_PAGE;
  const current = synthesisOpen ? undefined : pickPage(pages, slug);
  const publication = data?.publication ?? { available: false, last: null };
  return {
    projectId,
    gate: unauthorized ? ("loading" as const) : gateOf(list),
    refetch: () => void list.refetch(),
    pages,
    trash: data?.trash ?? [],
    pageProposals: data?.pendingPageProposals ?? [],
    decisions,
    publication,
    maturity: data?.maturity ?? {
      stable: 0,
      total: pages.length,
      missingRequired: [],
      openQuestions: 0,
    },
    version: data?.version ?? { latest: null, modifiedSince: false },
    synthesisOpen,
    slug,
    current,
    currentIndex: current ? pages.indexOf(current) : -1,
    canWrite: canWriteIdea(role),
    canPublish: canPublishIdea(role),
    /** Passer au cadrage, figer, régénérer : l'équipe, dépôt relié (le serveur reste l'autorité). */
    canFreeze: canPublishIdea(role) && publication.available,
    actions,
  };
}

export type IdeaModel = ReturnType<typeof useIdeaPage>;
