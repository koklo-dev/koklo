"use client";

import { ActivityFeed, Card, ListFooter, ProjectHeader } from "@koklo/ui";
import { errorCode } from "../lib/api-error.ts";
import { projectPath } from "../lib/shell-routes.ts";
import { ACTIVITY_PAGE_SIZE, useProjectActivity } from "../lib/use-project-overview.ts";
import { useProjectShell } from "../lib/use-project-shell.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { ProjectNotFound } from "./features-empty.tsx";
import { feedItems } from "./overview-side.tsx";
import { OverviewError } from "./overview-states.tsx";
import { PageBody } from "./page-body.tsx";
import { ShellLink } from "./shell-link.tsx";

const NOUN = { one: "événement", other: "événements" };

function Feed({ query }: { query: ReturnType<typeof useProjectActivity> }) {
  const pages = query.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const total = pages.at(-1)?.total ?? 0;
  const state = query.isFetchingNextPage
    ? "loading"
    : query.isFetchNextPageError
      ? "error"
      : query.hasNextPage
        ? "more"
        : "end";
  return (
    <div className="flex flex-col gap-3" aria-busy={query.isFetchingNextPage || undefined}>
      <Card className="px-5">
        {items.length > 0 ? (
          <ActivityFeed label="Activité du projet" items={feedItems(items)} />
        ) : (
          <p className="text-meta text-muted-foreground">Aucune activité pour le moment.</p>
        )}
      </Card>
      {items.length > 0 ? (
        <ListFooter
          className="max-md:[&_button]:h-11 max-md:[&_button]:w-full"
          state={state}
          pageSize={ACTIVITY_PAGE_SIZE}
          loadedCount={items.length}
          total={total}
          noun={NOUN}
          onLoadMore={() => void query.fetchNextPage()}
          onRetry={() => void query.fetchNextPage()}
        />
      ) : null}
    </div>
  );
}

function Body({ query }: { query: ReturnType<typeof useProjectActivity> }) {
  const redirecting = useUnauthorizedRedirect(query.error);
  if (query.data) return <Feed query={query} />;
  if (query.isError && !redirecting) {
    return errorCode(query.error) === "NOT_FOUND" ? (
      <ProjectNotFound />
    ) : (
      <OverviewError
        onRetry={() => void query.refetch()}
        message="Impossible de charger l'activité."
      />
    );
  }
  return (
    <p role="status" aria-busy="true" className="text-meta text-muted-foreground">
      Chargement de l'activité
    </p>
  );
}

/** Activité complète d'un projet (`/projects/<id>/activity`) : mêmes phrases que l'aperçu, pages de 50 par curseur. */
export function ActivityPage({ projectId }: { projectId: string }) {
  const query = useProjectActivity(projectId);
  const shell = useProjectShell(projectId);
  const total = query.data?.pages.at(-1)?.total;
  return (
    <>
      <ProjectHeader
        project={{ name: shell.data?.name ?? "Projet", href: projectPath(projectId) }}
        page="Activité"
        title="Activité"
        {...(total !== undefined
          ? { summary: `${total} ${total === 1 ? NOUN.one : NOUN.other}` }
          : {})}
        LinkComponent={ShellLink}
      />
      <PageBody>
        <Body query={query} />
      </PageBody>
    </>
  );
}
