import { Button } from "@koklo/ui";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { AI_SETTINGS_LABELS as L } from "../lib/ai-settings-labels.ts";
import { BUTTON_CLASS } from "../lib/ai-settings-styles.ts";

/**
 * Confirmation en ligne du retrait (S-ai-settings §4.9) : un groupe nommé, pas de modale. Le focus arrive sur
 * « Garder la clé » (l'option sûre) ; Échap garde la clé. Sous 768 px les boutons sont empilés, « Garder » en premier.
 */
export function AiCredentialRemove({
  busy,
  onKeep,
  onRemove,
}: {
  busy: boolean;
  onKeep: () => void;
  onRemove: () => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => keepRef.current?.focus(), []);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !busy) onKeep();
  };
  return (
    <fieldset
      aria-label={L.confirmGroup}
      onKeyDown={onKeyDown}
      className="flex min-w-0 flex-col gap-3 rounded-md border p-3"
    >
      <p className="break-words text-sm">{L.confirmRemoval}</p>
      <div className="flex flex-col gap-2 md:flex-row">
        <Button
          ref={keepRef}
          type="button"
          variant="outline"
          disabled={busy}
          className={BUTTON_CLASS}
          onClick={onKeep}
        >
          {L.keep}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={busy}
          className={BUTTON_CLASS}
          onClick={onRemove}
        >
          {L.remove}
        </Button>
      </div>
    </fieldset>
  );
}
