"use client";

import { Alert, Button, Icon } from "@koklo/ui";

const TITLE_ID = "member-removal-title";
/** Cible du focus à la fermeture du menu : l'option sûre de la confirmation. */
export const KEEP_BUTTON_ID = "member-removal-keep";

interface MemberRemovalProps {
  name: string;
  busy: boolean;
  onConfirm: () => void;
  onKeep: () => void;
}

/**
 * Confirmation du retrait en ligne (même modèle que la suppression d'une fonctionnalité) : groupe nommé,
 * « Garder » reçoit le focus à la fermeture du menu (l'option sûre), Échap garde le membre.
 */
export function MemberRemoval({ name, busy, onConfirm, onKeep }: MemberRemovalProps) {
  return (
    <Alert
      role="group"
      aria-labelledby={TITLE_ID}
      onKeyDown={(event) => event.key === "Escape" && !busy && onKeep()}
    >
      <Icon name="warning" size={20} />
      <div className="flex flex-col gap-3">
        <span id={TITLE_ID} className="sr-only">
          Confirmer le retrait
        </span>
        <p className="font-medium">{`Retirer ${name} de l'organisation ?`}</p>
        <p>Cette personne perd l'accès à l'organisation et à ses projets, tout de suite.</p>
        <div className="flex flex-col gap-2 md:flex-row">
          <Button
            id={KEEP_BUTTON_ID}
            type="button"
            variant="outline"
            className="h-11 w-full md:h-9 md:w-fit"
            disabled={busy}
            onClick={onKeep}
          >
            Garder
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-11 w-full md:h-9 md:w-fit"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={onConfirm}
          >
            Retirer
          </Button>
        </div>
      </div>
    </Alert>
  );
}
