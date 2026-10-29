"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { orpc } from "./orpc.ts";
import { useActivateOrganization } from "./use-activate-organization.ts";
import { useSessionOrganizationId } from "./use-active-organization.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

/**
 * État de l'écran d'entrée : liste des organisations, organisation active, ouverture d'une
 * organisation, et ouverture automatique de l'unique organisation quand aucune n'est active.
 */
export function useOrganizationEntry() {
  const router = useRouter();
  const list = useQuery(orpc.organization.list.queryOptions());
  const session = useSessionOrganizationId();
  const { mutate, isPending, isError } = useActivateOrganization();
  const [openingId, setOpeningId] = useState<string>();
  useUnauthorizedRedirect(list.error);

  const organizations = list.data ?? [];
  const activeId = session.data;
  const single = organizations.length === 1 && !activeId ? organizations[0] : undefined;

  const open = useCallback(
    (organizationId: string) => {
      setOpeningId(organizationId);
      mutate(organizationId, { onSuccess: () => router.push("/projects") });
    },
    [mutate, router],
  );

  // L'ouverture automatique ne part qu'une fois la session connue, et une seule fois.
  useEffect(() => {
    if (single && !session.isPending && openingId === undefined) open(single.id);
  }, [single, session.isPending, openingId, open]);

  const opening = openingId === undefined ? single : organizations.find((o) => o.id === openingId);
  return {
    list,
    organizations,
    activeId,
    ready: list.isSuccess && !session.isPending,
    /** Organisation en cours d'ouverture automatique (écran « Ouverture de … »). */
    autoOpening: single && !isError ? opening : undefined,
    openingId: isPending ? openingId : undefined,
    openFailed: isError,
    open,
  };
}
