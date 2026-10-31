"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@koklo/ui";
import type { CreationOutcome, PendingResume } from "../lib/creation-types.ts";
import { useCreationPanel } from "../lib/use-creation-panel.ts";
import { ProjectCreateFlow } from "./project-create-flow.tsx";

interface SheetProps {
  open: boolean;
  /** Projet à reprendre (étape 2 seule) ; absent pour une création complète. */
  resume: PendingResume | null;
  onFinish: (outcome: CreationOutcome) => void;
  /** Rend le focus au bouton déclencheur (ou à la notice de reprise), même si la liste l'a remplacé. */
  onReturnFocus: () => void;
}

/**
 * Panneau « Créer un projet » (`Sheet`, 400 px). La page le remonte à chaque ouverture (`key`) : il repart
 * toujours de zéro. La fermeture (Échap, clic hors panneau) est sans effet pendant un appel en vol.
 */
export function ProjectCreateSheet({ open, resume, onFinish, onReturnFocus }: SheetProps) {
  const panel = useCreationPanel({ open, resume, onFinish });
  return (
    <Sheet open={open} onOpenChange={(next) => next || panel.requestClose()}>
      <SheetContent
        data-testid="create-project-sheet"
        aria-describedby={undefined}
        closeLabel="Quitter le panneau"
        className="sm:max-w-[400px]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onReturnFocus();
        }}
      >
        <SheetHeader>
          <SheetTitle>Créer un projet</SheetTitle>
        </SheetHeader>
        <ProjectCreateFlow panel={panel} resume={resume} />
      </SheetContent>
    </Sheet>
  );
}
