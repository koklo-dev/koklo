"use client";

import { Button, Card, Icon } from "@koklo/ui";
import { useRef, useState } from "react";
import type { CreationOutcome } from "../lib/creation-types.ts";
import { ProjectCreateSheet } from "./project-create-sheet.tsx";

interface MissingProps {
  projectId: string;
  projectName: string | undefined;
  /** Propriétaire ou administrateur : seuls à pouvoir créer le dépôt. */
  canCreate: boolean;
  /** Issue du panneau de création, une fois fermé. */
  onFinish: (outcome: CreationOutcome) => void;
  /** Le dépôt vient d'être créé : le focus ne revient pas au bouton (il disparaît avec cette carte). */
  created: boolean;
}

/** Projet sans dépôt de spec (§4.6) : la reprise de 48c s'ouvre en place, à l'étape 2, sans rappeler `project.create`. */
export function SpecRepoMissing({
  projectId,
  projectName,
  canCreate,
  onFinish,
  created,
}: MissingProps) {
  const [panel, setPanel] = useState({ key: 0, open: false });
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <Icon name="link" size={28} className="text-muted-foreground" />
      <h2 className="text-base font-semibold tracking-[-0.015em]">
        Ce projet n'a pas de dépôt de spec
      </h2>
      <p className="text-[13px] text-muted-foreground">
        {canCreate
          ? "Sans dépôt de spec, Koklo ne peut pas afficher ni enregistrer les fonctionnalités. Créez-le maintenant : il sera privé et lié à ce projet."
          : "Ce projet n'a pas encore de dépôt de spec. Un propriétaire ou un administrateur peut le créer."}
      </p>
      {canCreate ? (
        <Button
          ref={trigger}
          className="h-11 md:h-9"
          onClick={() => setPanel((current) => ({ key: current.key + 1, open: true }))}
        >
          <Icon name="add" size={20} />
          Créer le dépôt de spec
        </Button>
      ) : null}
      {panel.key > 0 ? (
        <ProjectCreateSheet
          key={panel.key}
          open={panel.open}
          resume={{ marker: { projectId, projectName: projectName ?? "Projet" }, offerLink: false }}
          onFinish={(outcome) => {
            setPanel((current) => ({ ...current, open: false }));
            onFinish(outcome);
          }}
          onReturnFocus={() => {
            if (!created) trigger.current?.focus();
          }}
        />
      ) : null}
    </Card>
  );
}
