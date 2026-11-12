"use client";

import { Alert, Button, Icon } from "@koklo/ui";
import { useEffect, useRef } from "react";

const TITLE_ID = "feature-delete-title";

interface ConfirmProps {
  specId: string;
  title: string;
  /** Suppression envoyée : « Suppression… », « Garder » désactivé. */
  busy: boolean;
  /** Éléments de la spec qui citent celle-ci (20 au plus) et leur nombre total. */
  referencedBy?: { items: { kind: string; specId: string; title: string }[]; total: number };
  onConfirm: () => void;
  onKeep: () => void;
}

/** Ce qui pointe vers l'élément supprimé : identifiant et titre, puis « et N autres » au-delà de la liste. */
function ReferencedBy({ referencedBy }: { referencedBy: ConfirmProps["referencedBy"] }) {
  if (!referencedBy || referencedBy.total === 0) return null;
  const more = referencedBy.total - referencedBy.items.length;
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">{`Renvoyée par ${referencedBy.total} élément${referencedBy.total > 1 ? "s" : ""} de la spec :`}</p>
      <ul className="flex list-none flex-col gap-0.5">
        {referencedBy.items.map((item) => (
          <li key={`${item.kind}-${item.specId}`}>
            <span className="font-mono">{item.specId}</span> {`« ${item.title} »`}
          </li>
        ))}
        {more > 0 ? <li>{`et ${more} autre${more > 1 ? "s" : ""}`}</li> : null}
      </ul>
    </div>
  );
}

/**
 * Confirmation de suppression en ligne, à la place du pied du panneau (S-feature-form §4.8) : un groupe nommé,
 * ni statut ni alerte, « Garder » reçoit le focus. Le titre est lu en entier (copie masquée) et affiché avec
 * l'identifiant en police mono (copie décorative).
 */
export function FeatureDeleteConfirm({
  specId,
  title,
  busy,
  referencedBy,
  onConfirm,
  onKeep,
}: ConfirmProps) {
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
        <ReferencedBy referencedBy={referencedBy} />
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
