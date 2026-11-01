"use client";

import { Alert, Button, Icon } from "@koklo/ui";
import { useEffect, useRef } from "react";
import { DELETE_TRIGGER_ID } from "../lib/feature-form-ids.ts";

const TITLE_ID = "feature-delete-title";

interface ConfirmProps {
  specId: string;
  title: string;
  /** Suppression envoyée : « Suppression… », « Garder » désactivé. */
  busy: boolean;
  onConfirm: () => void;
  onKeep: () => void;
}

/**
 * Confirmation de suppression en ligne, à la place du pied du panneau (S-feature-form §4.8) : un groupe nommé,
 * ni statut ni alerte, « Garder » reçoit le focus. Le titre est lu en entier (copie masquée) et affiché avec
 * l'identifiant en police mono (copie décorative).
 */
export function FeatureDeleteConfirm({ specId, title, busy, onConfirm, onKeep }: ConfirmProps) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <Alert role="group" aria-labelledby={TITLE_ID}>
      <Icon name="warning" size={20} />
      <div className="flex flex-col gap-3">
        <span id={TITLE_ID} className="sr-only">
          Confirmer la suppression
        </span>
        <p className="sr-only">{`Supprimer ${specId} « ${title} » ?`}</p>
        <p aria-hidden="true" className="font-medium">
          Supprimer <span className="font-mono">{specId}</span> {`« ${title} » ?`}
        </p>
        <p>
          Ses critères d'acceptation seront supprimés avec elle. Si d'autres éléments de la spec y
          renvoient (par exemple un scénario de test), la suppression sera refusée et vous verrez
          pourquoi.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="destructive"
            className="h-11 w-full md:h-9"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={onConfirm}
          >
            {busy ? "Suppression…" : "Supprimer"}
          </Button>
          <Button
            ref={keep}
            type="button"
            variant="outline"
            className="h-11 w-full md:h-9"
            disabled={busy}
            onClick={onKeep}
          >
            Garder
          </Button>
        </div>
      </div>
    </Alert>
  );
}

interface TriggerProps {
  disabled: boolean;
  describedBy: string | undefined;
  onAsk: () => void;
}

/** Entrée de la suppression : bouton à texte destructif dans le pied (jamais une icône seule). */
export function FeatureDeleteTrigger({ disabled, describedBy, onAsk }: TriggerProps) {
  return (
    <Button
      id={DELETE_TRIGGER_ID}
      type="button"
      variant="ghost"
      className="h-11 w-full text-destructive hover:text-destructive md:h-9 md:w-auto"
      disabled={disabled}
      aria-describedby={describedBy}
      onClick={onAsk}
    >
      Supprimer cette fonctionnalité
    </Button>
  );
}
