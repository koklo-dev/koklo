import { InlineAlert } from "@koklo/ui";
import type { ReactNode } from "react";
import { rateLimitedReadText } from "../lib/git-read-labels.ts";

interface GitReadErrorProps {
  error: unknown;
  /** Relance la requête (`refetch`). */
  onRetry: () => void;
  /** Relance en cours : « Réessayer » reste à sa place, désactivé. */
  retrying: boolean;
  /** Message habituel de l'écran pour toute autre erreur. */
  fallback: ReactNode;
}

/**
 * Lecture Git en échec (TK-114f, S-spec-architecture §17) : quota GitHub épuisé → `InlineAlert` d'erreur avec le
 * délai et « Réessayer » ; toute autre erreur → le message habituel, inchangé.
 */
export function GitReadError({ error, onRetry, retrying, fallback }: GitReadErrorProps) {
  const text = rateLimitedReadText(error);
  if (text === undefined) return <p className="m-0 text-body text-destructive">{fallback}</p>;
  return (
    <InlineAlert
      variant="error"
      icon="schedule"
      actions={[{ label: "Réessayer", onClick: onRetry, disabled: retrying }]}
    >
      {text}
    </InlineAlert>
  );
}
