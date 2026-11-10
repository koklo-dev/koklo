"use client";

import { useState } from "react";
import type { CreatedProject } from "./use-project-create.ts";

interface DialogState {
  /** Change à chaque ouverture : la boîte est remontée et repart de zéro (nouvelle clé d'idempotence). */
  key: number;
  open: boolean;
}

/** Boîte « Nouveau projet » de la page : ouverture, fermeture et annonce « Projet « … » créé. ». */
export function useNewProject() {
  const [dialog, setDialog] = useState<DialogState>({ key: 0, open: false });
  const [announcement, setAnnouncement] = useState("");
  return {
    dialog,
    announcement,
    open: () => {
      setAnnouncement("");
      setDialog((current) => ({ key: current.key + 1, open: true }));
    },
    close: () => setDialog((current) => ({ ...current, open: false })),
    created: (project: CreatedProject) => {
      setDialog((current) => ({ ...current, open: false }));
      setAnnouncement(`Projet « ${project.name} » créé.`);
    },
  };
}
