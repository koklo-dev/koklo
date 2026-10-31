"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { orpc } from "../lib/orpc.ts";
import { canManage } from "../lib/roles.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { useCreationPage } from "../lib/use-creation-page.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { ProjectCreateSheet } from "./project-create-sheet.tsx";
import { type ProjectsState, ProjectsView } from "./projects-view.tsx";
import { SpecRepoResumeNotice } from "./spec-repo-resume-notice.tsx";

export function ProjectsPage() {
  const query = useQuery(orpc.project.list.queryOptions());
  const { organizations, session, role } = useActiveOrganization();
  const redirecting = useUnauthorizedRedirect(query.error);
  const createButton = useRef<HTMLButtonElement>(null);
  const resumeButton = useRef<HTMLButtonElement>(null);
  const creation = useCreationPage(query.data, canManage(role));

  // Le rôle conditionne le texte de l'état vide : on attend de le connaître pour éviter un flash.
  const roleKnown = !organizations.isPending && !session.isPending;
  let state: ProjectsState = { status: "loading" };
  if (query.data && roleKnown) state = { status: "success", projects: query.data };
  else if (query.isError && !query.isFetching && !redirecting) state = { status: "error" };

  const { panel, pending } = creation;
  return (
    <>
      <div role="status" className="mb-3 text-[13px] text-muted-foreground empty:hidden">
        {creation.announcement}
      </div>
      {pending && canManage(role) ? (
        <SpecRepoResumeNotice
          pending={pending}
          resumeRef={resumeButton}
          onResume={(openLink) => creation.open({ ...pending, openLink })}
          onIgnore={() => {
            creation.ignore();
            createButton.current?.focus();
          }}
        />
      ) : null}
      <ProjectsView
        state={state}
        onRetry={() => void query.refetch()}
        {...(canManage(role) ? { onCreate: () => creation.open() } : {})}
        createButtonRef={createButton}
      />
      {panel.key > 0 ? (
        <ProjectCreateSheet
          key={panel.key}
          open={panel.open}
          resume={panel.resume}
          onFinish={creation.finish}
          onReturnFocus={() =>
            ((creation.takeNoticeFocus() && resumeButton.current) || createButton.current)?.focus()
          }
        />
      ) : null}
    </>
  );
}
