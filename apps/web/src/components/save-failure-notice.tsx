"use client";

import { InlineAlert } from "@koklo/ui";
import { SAVE_FAILURE_TEXT } from "../lib/proposal-labels.ts";

/**
 * Enregistrement échoué de la relecture (DESIGN §5.25, S-spec-architecture §16, B674) : `InlineAlert` `error`
 * (`role="alert"`), motif en mots simples, une seule action « Réessayer l'enregistrement », désactivée pendant l'envoi.
 */
export function SaveFailureNotice({
  failure,
  saving,
  onRetry,
}: {
  failure: { count: number; errorCode: string | null };
  saving: boolean;
  onRetry: () => void;
}) {
  return (
    <InlineAlert
      variant="error"
      icon="sync_problem"
      actions={[
        {
          label: saving ? "Enregistrement…" : "Réessayer l'enregistrement",
          onClick: onRetry,
          primary: true,
          disabled: saving,
        },
      ]}
    >
      {SAVE_FAILURE_TEXT(failure.count, failure.errorCode)}
    </InlineAlert>
  );
}
