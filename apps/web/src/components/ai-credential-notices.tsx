import { Alert, AlertDescription, AlertTitle, Icon } from "@koklo/ui";
import { formatRetry } from "../lib/ai-errors.ts";
import { AI_SETTINGS_LABELS as L } from "../lib/ai-settings-labels.ts";
import type { AlertView } from "../lib/ai-settings-outcomes.ts";
import type { AiCredentialSession } from "../lib/use-ai-credential-session.ts";

/** Texte de la région d'état : progression, succès, puis annonce du compte à rebours (par paliers de 15 s). */
function statusText(session: AiCredentialSession): string {
  const { state, announcement } = session;
  if (state.phase === "saving") return L.progressSave;
  if (state.phase === "verifying") return state.flow === "save" ? L.progressSave : L.progressVerify;
  if (state.phase === "removing") return L.progressRemove;
  if (state.notice?.kind === "status") return state.notice.text;
  return announcement;
}

/**
 * Région d'état unique (`role="status"`, polie) : succès et progression ; toujours dans le document pour que les
 * lecteurs d'écran annoncent ses changements. Aucune annonce ne cite la clé.
 */
export function AiCredentialStatusRegion({ session }: { session: AiCredentialSession }) {
  return (
    <p role="status" className="min-w-0 break-words text-sm empty:hidden">
      {statusText(session)}
    </p>
  );
}

/** Fin de la phrase de la limite : le chiffre bouge chaque seconde sans être annoncé (la région le fait par palier). */
function Countdown({ remaining }: { remaining: number | null }) {
  if (remaining === null || remaining <= 0) return null;
  return <span aria-hidden="true">{` Réessayez dans ${formatRetry(remaining)}.`}</span>;
}

/** L'unique alerte d'échec : icône + texte, jamais le message du fournisseur ni la clé. */
export function AiCredentialAlert({
  alert,
  remaining,
}: {
  alert: AlertView;
  remaining: number | null;
}) {
  return (
    <Alert variant="destructive">
      <Icon name={alert.icon} size={20} />
      {alert.title ? <AlertTitle>{alert.title}</AlertTitle> : null}
      <AlertDescription className="flex min-w-0 flex-col items-start gap-1 break-words">
        <p>
          {alert.text}
          {alert.countdown ? <Countdown remaining={remaining} /> : null}
        </p>
        {alert.detail ? <p>{alert.detail}</p> : null}
      </AlertDescription>
    </Alert>
  );
}
