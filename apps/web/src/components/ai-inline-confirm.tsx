import { Button } from "@koklo/ui";
import { type KeyboardEvent, useEffect, useRef } from "react";

interface Props {
  groupLabel: string;
  text: string;
  keepLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  busy: boolean;
  onKeep: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation en ligne (S-ai-settings §5) : un groupe nommé, pas de modale. Le focus arrive sur l'option sûre
 * (« Garder ») ; Échap garde. Sous 768 px les boutons sont empilés, « Garder » en premier, cibles de 44 px.
 */
export function AiInlineConfirm({
  groupLabel,
  text,
  keepLabel,
  confirmLabel,
  destructive = false,
  busy,
  onKeep,
  onConfirm,
}: Props) {
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => keepRef.current?.focus(), []);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !busy) onKeep();
  };
  return (
    <fieldset
      aria-label={groupLabel}
      onKeyDown={onKeyDown}
      className="flex min-w-0 flex-col gap-3 rounded-md border p-3"
    >
      <p className="break-words text-sm">{text}</p>
      <div className="flex flex-col gap-2 md:flex-row">
        <Button
          ref={keepRef}
          type="button"
          variant="outline"
          disabled={busy}
          className="h-11 w-full md:h-9 md:w-auto"
          onClick={onKeep}
        >
          {keepLabel}
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          disabled={busy}
          className="h-11 w-full md:h-9 md:w-auto"
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </fieldset>
  );
}
