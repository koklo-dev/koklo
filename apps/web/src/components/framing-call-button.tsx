import { Button, Icon } from "@koklo/ui";
import { useEffect, useRef } from "react";

interface Props {
  id: string;
  label: string;
  /** Cet appel est celui qui attend : bouton inactif « Génération en cours… » et « Annuler l'attente ». */
  busy: boolean;
  /** Un autre appel attend, ou une limite est en cours : le bouton reste inactif. */
  disabled: boolean;
  /** Raison d'un désactivé durable (saisie vide), affichée à côté du bouton par `Button disabledReason`. */
  reason?: string | undefined;
  /** L'attente vient d'être abandonnée : la demande est déjà comptée. */
  cancelled: boolean;
  onClick: () => void;
  onCancel: () => void;
}

function CancelWait({ onCancel }: { onCancel: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  // Le focus reste sur l'annulation pendant toute l'attente (S-framing §4.3).
  useEffect(() => ref.current?.focus(), []);
  return (
    <Button
      ref={ref}
      type="button"
      variant="outline"
      className="h-11 w-full md:h-9 md:w-auto"
      onClick={onCancel}
    >
      Annuler l'attente
    </Button>
  );
}

/** Bouton d'appel IA qui nomme le destinataire (« ... avec l'IA ») et gère l'attente : un seul appel à la fois. */
export function FramingCallButton(props: Props) {
  const { id, label, busy, disabled, reason, cancelled, onClick, onCancel } = props;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 md:flex-row">
        <Button
          id={id}
          type="button"
          className="h-11 w-full md:h-9 md:w-auto"
          disabled={busy || disabled}
          disabledReason={reason}
          onClick={onClick}
        >
          <Icon name="smart_toy" size={20} />
          {busy ? "Génération en cours…" : label}
        </Button>
        {busy ? <CancelWait onCancel={onCancel} /> : null}
      </div>
      {cancelled ? (
        <p className="text-meta text-muted-foreground">La demande a déjà été comptée.</p>
      ) : null}
    </div>
  );
}
