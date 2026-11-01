import { Alert, Button, Icon } from "@koklo/ui";
import { useEffect, useRef } from "react";
import type { Banner } from "../lib/use-feature-form.ts";

const CONFIRM = "Abandonner ce brouillon ? Votre saisie sera effacée.";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface BannerProps {
  banner: Banner;
  confirming: boolean;
  onAsk: (confirming: boolean) => void;
  onAbandon: () => void;
  onKeepDraft: () => void;
}

function Confirm({ onKeep, onAbandon }: { onKeep: () => void; onAbandon: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <>
      <p>{CONFIRM}</p>
      <div className="flex flex-col gap-2 md:flex-row">
        <Button type="button" variant="destructive" className="h-11 md:h-9" onClick={onAbandon}>
          Abandonner
        </Button>
        <Button ref={keep} type="button" variant="outline" className="h-11 md:h-9" onClick={onKeep}>
          Garder
        </Button>
      </div>
    </>
  );
}

/** Brouillon repris (S-feature-form §5.5) : bandeau neutre, abandon confirmé dans le panneau, sans dialogue empilé. */
export function DraftBanner({ banner, confirming, onAsk, onAbandon, onKeepDraft }: BannerProps) {
  const changed = banner.kind === "changed";
  return (
    <Alert role="group" aria-label="Brouillon">
      <Icon name="edit_note" size={20} />
      <div className="flex flex-col items-start gap-3">
        {confirming ? (
          <Confirm onKeep={() => onAsk(false)} onAbandon={onAbandon} />
        ) : (
          <>
            <p>
              {changed
                ? "Cette fonctionnalité a changé depuis votre brouillon."
                : `Brouillon repris, enregistré le ${formatDate(banner.savedAt)}.`}
            </p>
            <div className="flex flex-col gap-2 md:flex-row">
              {changed ? (
                <>
                  <Button type="button" className="h-11 md:h-9" onClick={onKeepDraft}>
                    Garder mon brouillon
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 md:h-9"
                    onClick={() => onAsk(true)}
                  >
                    Repartir de la version actuelle
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 md:h-9"
                  onClick={() => onAsk(true)}
                >
                  Abandonner le brouillon
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Alert>
  );
}
