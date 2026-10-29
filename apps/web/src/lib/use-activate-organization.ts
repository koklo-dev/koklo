"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "./auth-client.ts";

/** Active une organisation sur la session puis invalide toutes les données (elles dépendent de l'organisation). */
export function useActivateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const result = await authClient.organization.setActive({ organizationId });
      if (result?.error) throw new Error(result.error.message ?? "setActive");
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
