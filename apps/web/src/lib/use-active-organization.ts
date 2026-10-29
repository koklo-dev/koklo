"use client";

import { useQuery } from "@tanstack/react-query";
import { authClient } from "./auth-client.ts";
import { orpc } from "./orpc.ts";

export const SESSION_QUERY_KEY = ["auth", "session"] as const;

/** Identifiant de l'organisation active de la session (null : aucune), tel que Better Auth le porte. */
export function useSessionOrganizationId() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => authClient.getSession(),
    select: (result) => result.data?.session.activeOrganizationId ?? null,
  });
}

/** Organisation active de la session croisée avec `organization.list` (nom et rôle courant). */
export function useActiveOrganization() {
  const organizations = useQuery(orpc.organization.list.queryOptions());
  const session = useSessionOrganizationId();
  const activeId = session.data;
  const active = organizations.data?.find((organization) => organization.id === activeId);
  return { organizations, session, activeId, active, role: active?.role };
}
