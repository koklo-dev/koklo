"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { redirectForError } from "../lib/auth-guard.ts";
import { orpc } from "../lib/orpc.ts";
import { type ProjectsState, ProjectsView } from "./projects-view.tsx";

export function ProjectsPage() {
  const router = useRouter();
  const query = useQuery(orpc.project.list.queryOptions());
  const redirect = query.isError ? redirectForError(query.error) : null;

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  let state: ProjectsState = { status: "loading" };
  if (query.data) state = { status: "success", projects: query.data };
  else if (query.isError && !query.isFetching && !redirect) state = { status: "error" };

  return <ProjectsView state={state} onRetry={() => void query.refetch()} />;
}
