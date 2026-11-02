import { Alert, Button, Icon } from "@koklo/ui";
import type { AiErrorView } from "../lib/ai-errors.ts";
import { formatRetry } from "../lib/ai-errors.ts";
import { IDS } from "../lib/framing-ids.ts";

interface Props {
  view: AiErrorView;
  /** Secondes restantes avant le prochain essai (limite atteinte) ; `null` hors limite. */
  remaining: number | null;
  onRetry: () => void;
}

/** Fin de la phrase de la limite atteinte : le chiffre bouge chaque seconde mais n'est pas annoncé (la région d'état le fait par palier). */
function Countdown({ remaining }: { remaining: number | null }) {
  if (remaining === null) return null;
  return (
    <span aria-hidden="true">
      {remaining > 0 ? ` Réessayez dans ${formatRetry(remaining)}.` : " Vous pouvez réessayer."}
    </span>
  );
}

/**
 * L'unique alerte d'échec d'un appel IA (S-framing §4.5 à §4.9) : icône + texte, jamais le message du
 * fournisseur ni le texte saisi. « Réessayer » seulement quand c'est sûr.
 */
export function AiErrorNotice({ view, remaining, onRetry }: Props) {
  return (
    <Alert variant="destructive" id={IDS.error} tabIndex={-1} className="outline-none">
      <Icon name={view.icon} size={20} />
      <div className="flex flex-col items-start gap-2">
        <p className="font-medium">
          {view.message}
          <Countdown remaining={remaining} />
        </p>
        {view.detail ? <p>{view.detail}</p> : null}
        {view.action ? <p>{view.action}</p> : null}
        {view.retryable ? (
          <>
            <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onRetry}>
              Réessayer
            </Button>
            <p className="text-[13px] text-muted-foreground">
              Chaque essai est compté dans les limites de votre organisation.
            </p>
          </>
        ) : null}
      </div>
    </Alert>
  );
}
