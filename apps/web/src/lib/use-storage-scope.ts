"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { authClient } from "./auth-client.ts";
import { beginFeatureSession, type StorageScope } from "./feature-draft.ts";
import { SESSION_QUERY_KEY } from "./use-active-organization.ts";

/** Compte connecté et organisation active : propriétaire des brouillons locaux (`null` tant qu'inconnu). */
export function useStorageScope(): StorageScope | null {
  const { data } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => authClient.getSession(),
    select: (result) => ({
      userId: result.data?.user.id ?? null,
      organizationId: result.data?.session.activeOrganizationId ?? null,
    }),
  });
  const userId = data?.userId ?? null;
  const organizationId = data?.organizationId ?? null;
  return useMemo(
    () => (userId && organizationId ? { userId, organizationId } : null),
    [userId, organizationId],
  );
}

/** Début de session pour ce compte et cette organisation : un autre compte ne retrouve rien de ce que le précédent a laissé. */
export function useBeginFeatureSession(scope: StorageScope | null): void {
  useEffect(() => {
    if (scope) beginFeatureSession(scope);
  }, [scope]);
}
