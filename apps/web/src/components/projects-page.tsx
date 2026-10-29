"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { orpc } from "../lib/orpc.ts";
import { canManage } from "../lib/roles.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { ProjectCreateSheet } from "./project-create-sheet.tsx";
import { type ProjectsState, ProjectsView } from "./projects-view.tsx";

export function ProjectsPage() {
  const query = useQuery(orpc.project.list.queryOptions());
  const { organizations, session, role } = useActiveOrganization();
  const redirecting = useUnauthorizedRedirect(query.error);
  const createButton = useRef<HTMLButtonElement>(null);
  const [creating, setCreating] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  // Le rôle conditionne le texte de l'état vide : on attend de le connaître pour éviter un flash.
  const roleKnown = !organizations.isPending && !session.isPending;
  let state: ProjectsState = { status: "loading" };
  if (query.data && roleKnown) state = { status: "success", projects: query.data };
  else if (query.isError && !query.isFetching && !redirecting) state = { status: "error" };

  const openCreate = () => {
    setAnnouncement("");
    setCreating(true);
  };
  return (
    <>
      <div role="status" className="mb-3 text-[13px] text-muted-foreground empty:hidden">
        {announcement}
      </div>
      <ProjectsView
        state={state}
        onRetry={() => void query.refetch()}
        {...(canManage(role) ? { onCreate: openCreate } : {})}
        createButtonRef={createButton}
      />
      <ProjectCreateSheet
        open={creating}
        onOpenChange={setCreating}
        onReturnFocus={() => createButton.current?.focus()}
        onCreated={(name) => {
          setAnnouncement(`Projet « ${name} » créé.`);
          setCreating(false);
        }}
      />
    </>
  );
}
