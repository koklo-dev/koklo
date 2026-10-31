"use client";

import { useEffect, useRef, useState } from "react";
import { clearCreationResume, readCreationResume, writeCreationResume } from "./creation-resume.ts";
import type { CreationOutcome, PendingResume } from "./creation-types.ts";

interface PanelState {
  /** Change à chaque ouverture : le panneau est remonté et repart de zéro. */
  key: number;
  open: boolean;
  resume: PendingResume | null;
}

const ANNOUNCEMENTS: Record<string, (name: string) => string> = {
  "created-with-repo": (name) => `Projet « ${name} » et dépôt de spec créés.`,
  linked: (name) => `Projet « ${name} » et dépôt de spec reliés.`,
  "existing-repo": () => "Ce projet a déjà son dépôt de spec.",
  created: (name) => `Projet « ${name} » créé.`,
};

/**
 * État de la page des projets autour du panneau de création : ouverture, reprise d'un projet sans dépôt
 * (notice + marqueur de session) et annonce du résultat.
 */
export function useCreationPage(projects: { id: string }[] | undefined, canCreate: boolean) {
  const [panel, setPanel] = useState<PanelState>({ key: 0, open: false, resume: null });
  const [pending, setPending] = useState<PendingResume | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const markerRead = useRef(false);
  const focusNotice = useRef(false);

  // Retour de GitHub ou onglet rouvert : un marqueur valide, dont le projet existe, devient une notice.
  useEffect(() => {
    if (markerRead.current || !canCreate || !projects) return;
    markerRead.current = true;
    const marker = readCreationResume();
    if (marker && projects.some((project) => project.id === marker.projectId)) {
      setPending({ marker, offerLink: false });
    }
  }, [canCreate, projects]);

  const open = (resume: PendingResume | null = null) => {
    setAnnouncement("");
    setPanel((current) => ({ key: current.key + 1, open: true, resume }));
  };

  const finish = (outcome: CreationOutcome) => {
    setPanel((current) => ({ ...current, open: false }));
    if (outcome.kind === "cancelled") return;
    if (outcome.kind === "unresolved") {
      writeCreationResume(outcome.marker);
      focusNotice.current = true;
      setPending({ marker: outcome.marker, offerLink: outcome.offerLink });
      return;
    }
    clearCreationResume();
    setPending(null);
    setAnnouncement(ANNOUNCEMENTS[outcome.kind]?.(outcome.name) ?? "");
  };

  const ignore = () => {
    clearCreationResume();
    setPending(null);
  };

  return {
    panel,
    pending,
    announcement,
    open,
    finish,
    ignore,
    /** Vrai une fois (juste après une fermeture sans dépôt) : le focus va à la notice de reprise. */
    takeNoticeFocus: () => {
      const wanted = focusNotice.current;
      focusNotice.current = false;
      return wanted;
    },
  };
}
