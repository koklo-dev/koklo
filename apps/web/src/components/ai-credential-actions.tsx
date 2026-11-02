import { Button } from "@koklo/ui";
import { type RefObject, useEffect, useRef, useState } from "react";
import { AI_SETTINGS_LABELS as L } from "../lib/ai-settings-labels.ts";
import { BUTTON_CLASS } from "../lib/ai-settings-styles.ts";
import type { AiCredentialSession } from "../lib/use-ai-credential-session.ts";
import { AiCredentialRemove } from "./ai-credential-remove.tsx";

function VerifyAndReplace({
  session,
  replaceRef,
}: {
  session: AiCredentialSession;
  replaceRef: RefObject<HTMLButtonElement | null>;
}) {
  const { state, waiting } = session;
  const busy = state.phase !== "idle";
  return (
    <>
      <Button
        type="button"
        disabled={busy || waiting}
        aria-busy={state.phase === "verifying" || undefined}
        className={BUTTON_CLASS}
        onClick={() => void session.verifyAgain()}
      >
        {state.phase === "verifying" ? L.verifyingShort : L.verifyAgain}
      </Button>
      <Button
        ref={replaceRef}
        type="button"
        variant="outline"
        disabled={busy}
        className={BUTTON_CLASS}
        onClick={session.openReplace}
      >
        {L.replace}
      </Button>
    </>
  );
}

/**
 * Actions d'une clé existante (S-ai-settings §4.3). `full` : vérifier, remplacer, retirer ; sinon (formulaire de
 * remplacement ouvert, clé refusée ou illisible) seulement « Retirer la clé ». Une seule action en vol : les autres
 * boutons sont désactivés. Le retrait demande une confirmation en ligne.
 */
export function AiCredentialActions({
  session,
  full,
  restoreReplace,
  onRestored,
}: {
  session: AiCredentialSession;
  full: boolean;
  /** Le formulaire de remplacement vient d'être refermé : le focus revient sur « Remplacer la clé ». */
  restoreReplace: boolean;
  onRestored: () => void;
}) {
  const { state } = session;
  const [confirming, setConfirming] = useState(false);
  const [back, setBack] = useState(false);
  const removeRef = useRef<HTMLButtonElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);
  const busy = state.phase !== "idle";

  // « Garder la clé » : les actions reviennent, le focus aussi sur « Retirer la clé ».
  useEffect(() => {
    if (back && !confirming) {
      removeRef.current?.focus();
      setBack(false);
    }
  }, [back, confirming]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: une seule restitution par fermeture du formulaire
  useEffect(() => {
    if (!restoreReplace) return;
    replaceRef.current?.focus();
    onRestored();
  }, [restoreReplace]);

  if (confirming) {
    return (
      <AiCredentialRemove
        busy={busy}
        onKeep={() => {
          setConfirming(false);
          setBack(true);
        }}
        onRemove={() => void session.removeKey().finally(() => setConfirming(false))}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2 md:flex-row">
      {full ? <VerifyAndReplace session={session} replaceRef={replaceRef} /> : null}
      <Button
        ref={removeRef}
        type="button"
        variant="outline"
        disabled={busy}
        className={`${BUTTON_CLASS} text-destructive`}
        onClick={() => setConfirming(true)}
      >
        {L.remove}
      </Button>
    </div>
  );
}
