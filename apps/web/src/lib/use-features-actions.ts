"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { clearCreationResume } from "./creation-resume.ts";
import type { CreationOutcome } from "./creation-types.ts";
import { plural } from "./features-region.ts";
import type { FeaturesView } from "./features-view.ts";
import { orpc } from "./orpc.ts";

/**
 * Annonces de la région d'état : « La spec est prête. » quand la liste remplace la carte de préparation,
 * « N fonctionnalités de plus affichées. », « Dépôt de spec créé. ». Effacées quand un filtre change.
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
    moreShown: (count: number) =>
      setAnnouncement(
        `${plural(count, "fonctionnalité")} de plus ${count > 1 ? "affichées" : "affichée"}.`,
      ),
  };
}

/** Issue du panneau de création du dépôt (reprise en place) : relit la spec et les dépôts du projet. */
export function useRepoCreated(announce: (text: string) => void) {
  const queryClient = useQueryClient();
  const [created, setCreated] = useState(false);
  const onFinish = useCallback(
    (outcome: CreationOutcome) => {
      if (!["created-with-repo", "linked", "existing-repo"].includes(outcome.kind)) return;
      clearCreationResume();
      setCreated(true);
      if (outcome.kind !== "existing-repo") {
        announce(outcome.kind === "linked" ? "Dépôt de spec relié." : "Dépôt de spec créé.");
      }
      void queryClient.invalidateQueries({ queryKey: orpc.spec.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.repo.key() });
    },
    [announce, queryClient],
  );
  return { created, onFinish };
}
