"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeaturesView } from "./features-view.ts";
import { orpc } from "./orpc.ts";
import type { RepoOutcome } from "./use-spec-repo-create.ts";

/**
 * Annonces de la région d'état : « La spec est prête. » quand la liste remplace la carte de préparation,
 * « Dépôt de spec créé. ». Effacées quand un filtre change. L'arrivée d'une page est annoncée par la barre de compte.
 */
export function useAnnouncements(view: FeaturesView) {
  const [announcement, setAnnouncement] = useState("");
  const wasPreparing = useRef(false);
  useEffect(() => {
    if (view.kind === "preparing") wasPreparing.current = true;
    else if (view.kind === "list" && wasPreparing.current) {
      wasPreparing.current = false;
      setAnnouncement("La spec est prête.");
    }
  }, [view.kind]);
  return {
    announcement,
    announce: setAnnouncement,
  };
}

/** Issue de la boîte de création du dépôt (en place) : relit la spec et les dépôts du projet. */
export function useRepoCreated(announce: (text: string) => void) {
  const queryClient = useQueryClient();
  const [created, setCreated] = useState(false);
  const onFinish = useCallback(
    (outcome: RepoOutcome) => {
      setCreated(true);
      if (outcome !== "existing-repo") announce("Dépôt de spec créé.");
      void queryClient.invalidateQueries({ queryKey: orpc.spec.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.repo.key() });
    },
    [announce, queryClient],
  );
  return { created, onFinish };
}
