import type { LlmCredentialStatusOutput } from "@koklo/contract";
import { Icon } from "@koklo/ui";
import { useId, useState } from "react";
import { AI_SETTINGS_LABELS as L } from "../lib/ai-settings-labels.ts";
import type { AiCredentialSession } from "../lib/use-ai-credential-session.ts";
import { AiCredentialActions } from "./ai-credential-actions.tsx";
import { AiCredentialForm } from "./ai-credential-form.tsx";
import { AiCredentialAlert, AiCredentialStatusRegion } from "./ai-credential-notices.tsx";
import {
  AiCredentialFacts,
  AiCredentialStatus,
  type CardState,
  cardStateOf,
} from "./ai-credential-status.tsx";
import { AiSendPolicy } from "./ai-send-policy.tsx";

const EXPLANATIONS: Record<CardState, string | null> = {
  absent: L.missingText,
  configured: null,
  invalid: L.invalidText,
  unreadable: L.unreadableText,
};

/**
 * Carte « Anthropic » (S-ai-settings §3, §4) : statut, lecture seule, politique d'envoi toujours rendue, puis le
 * formulaire (clé absente, refusée, illisible ou remplacement) ou les actions (clé configurée).
 */
export function AiCredentialCard({
  item,
  session,
}: {
  item: LlmCredentialStatusOutput | undefined;
  session: AiCredentialSession;
}) {
  const { state } = session;
  const headingId = useId();
  const [restoreReplace, setRestoreReplace] = useState(false);
  const cardState = cardStateOf(item, state);
  const replacing = cardState === "configured" && state.replacing;
  const showForm = cardState !== "configured" || replacing;
  const explanation = EXPLANATIONS[cardState];
  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-section-title">
          {L.provider}
        </h2>
        <AiCredentialStatus item={item} state={cardState} verifying={state.phase === "verifying"} />
      </div>
      {explanation ? <p className="break-words text-sm">{explanation}</p> : null}
      {item ? <AiCredentialFacts item={item} verifiedModel={state.verifiedModel} /> : null}
      <AiSendPolicy />
      <p className="flex items-start gap-2 text-meta text-muted-foreground">
        <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
        <span className="min-w-0 break-words">{L.encrypted}</span>
      </p>
      <AiCredentialStatusRegion session={session} />
      {state.notice?.kind === "alert" ? (
        <AiCredentialAlert alert={state.notice.alert} remaining={session.remaining} />
      ) : null}
      {showForm ? (
        <AiCredentialForm
          phase={state.phase}
          waiting={session.waiting}
          onSave={session.save}
          onCancel={
            replacing
              ? () => {
                  setRestoreReplace(true);
                  session.closeReplace();
                }
              : undefined
          }
          focusSignal={state.focusSignal}
        />
      ) : null}
      {item ? (
        <AiCredentialActions
          session={session}
          full={!showForm}
          restoreReplace={restoreReplace}
          onRestored={() => setRestoreReplace(false)}
        />
      ) : null}
      {item && !showForm ? <p className="text-meta text-muted-foreground">{L.quotaNote}</p> : null}
    </section>
  );
}
