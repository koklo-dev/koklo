"use client";

import { countLabel } from "./project-card-model.ts";
import { projectsViewKind } from "./projects-view.ts";
import { canManage } from "./roles.ts";
import { useActiveOrganization } from "./use-active-organization.ts";
import { useNewProject } from "./use-new-project.ts";
import { useBottomSentinel, useProjectCards } from "./use-project-cards.ts";
import { useProjectsUrl } from "./use-projects-url.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

type Cards = ReturnType<typeof useProjectCards>;

export interface GridFooter {
  state: "more" | "loading" | "error" | "end";
  loadedCount: number;
  total: number;
  onLoadMore: () => void;
  onRetry: () => void;
}

function footerOf(query: Cards, loadedCount: number, total: number): GridFooter {
  const state = query.isFetchingNextPage
    ? "loading"
    : query.isFetchNextPageError
      ? "error"
      : query.hasNextPage
        ? "more"
        : "end";
  const next = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  };
  return { state, loadedCount, total, onLoadMore: next, onRetry: () => void query.fetchNextPage() };
}

/** Tout ce que la page `/projects` lit : adresse, cartes, état affiché, pied de liste, droits et création. */
export function useProjectsPage() {
  const url = useProjectsUrl();
  const query = useProjectCards(url);
  const { organizations, session, active, role } = useActiveOrganization();
  const redirecting = useUnauthorizedRedirect(query.error);
  const pages = query.data?.pages ?? [];
  const head = pages[0];
  const total = pages.at(-1)?.total ?? 0;
  const shown = pages.reduce((sum, page) => sum + page.items.length, 0);
  const manage = canManage(role);
  const creation = useNewProject();
  const footer = footerOf(query, shown, total);
  const sentinel = useBottomSentinel(footer.onLoadMore, footer.state === "more");
  const filtered = Boolean(url.q.trim() || url.phase);
  const kind = projectsViewKind({
    hasData: Boolean(head),
    failed: !head && query.isError && !query.isFetching && !redirecting,
    roleKnown: !organizations.isPending && !session.isPending,
    filtered,
    total,
    shown,
  });
  return {
    url,
    query,
    head,
    kind,
    footer,
    sentinel,
    manage,
    organizationName: active?.name ?? "Organisation",
    creation,
    announcement:
      creation.announcement || (kind === "grid" && filtered ? countLabel(total, 0) : ""),
  };
}
