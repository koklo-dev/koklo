"use client";

import type { IdeaSynthesis } from "@koklo/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "./orpc.ts";

export type SynthesisGate = "loading" | "error" | "ready";

/**
 * Synthèse de l'idée : lecture (`idea.synthesis.get`, six rôles) et « Régénérer » (`ai.ideaSynthesis`, équipe).
 * Le texte précédent est gardé quand la régénération échoue ; la lecture n'a lieu que si la page est ouverte.
 */
export function useIdeaSynthesis(projectId: string, enabled: boolean) {
  const client = useQueryClient();
  const query = useQuery({
    ...orpc.idea.synthesis.get.queryOptions({ input: { projectId } }),
    enabled,
  });
  const [announcement, setAnnouncement] = useState("");
  const regeneration = useMutation({
    mutationFn: () => orpc.ai.ideaSynthesis.call({ projectId }),
    onSuccess: (synthesis) => {
      client.setQueryData<IdeaSynthesis | null>(
        orpc.idea.synthesis.get.queryOptions({ input: { projectId } }).queryKey,
        synthesis,
      );
      setAnnouncement("Synthèse régénérée.");
    },
    onMutate: () => setAnnouncement(""),
  });
  const gate: SynthesisGate = query.isPending ? "loading" : query.isError ? "error" : "ready";
  return {
    gate,
    data: query.data ?? null,
    refetch: () => void query.refetch(),
    regenerate: () => regeneration.mutate(),
    busy: regeneration.isPending,
    failed: regeneration.isError,
    announcement,
  };
}

export type IdeaSynthesisModel = ReturnType<typeof useIdeaSynthesis>;
