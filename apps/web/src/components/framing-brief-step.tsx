import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Icon } from "@koklo/ui";
import { BRIEF_FIELDS, linesOf } from "../lib/framing-brief.ts";
import { IDS } from "../lib/framing-ids.ts";
import type { BriefFields } from "../lib/framing-types.ts";
import type { FramingModel } from "../lib/use-framing-page.ts";
import { AiErrorNotice } from "./ai-error-notice.tsx";
import { AiSendPolicy } from "./ai-send-policy.tsx";
import { FramingCallButton } from "./framing-call-button.tsx";
import { AiBadge } from "./framing-proposal-parts.tsx";
import { FramingTextField } from "./framing-text-field.tsx";

const fieldId = (key: keyof BriefFields): string =>
  key === "title" ? IDS.briefTitle : `framing-brief-${key}`;

/** Les six champs du brief, éditables ; le badge disparaît dès la première modification du champ. */
function BriefFieldsForm({ page }: { page: FramingModel }) {
  const { state, view, change, patch } = page;
  const brief = state.brief;
  if (!brief) return null;
  return (
    <div className="flex flex-col gap-4">
      {BRIEF_FIELDS.map(({ key, label, rows }) => (
        <FramingTextField
          key={key}
          id={fieldId(key)}
          label={label}
          rows={rows}
          value={brief[key]}
          badge={view.aiFields.includes(key) ? <AiBadge /> : null}
          onChange={(value) => {
            change({ brief: { ...brief, [key]: value } });
            patch({ aiFields: view.aiFields.filter((field) => field !== key) });
          }}
        />
      ))}
    </div>
  );
}

/** Brief collé : relu tel quel, en texte brut ; il se corrige dans l'étape 1. */
function PastedBrief({ page }: { page: FramingModel }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">Brief à analyser</p>
      <p className="whitespace-pre-wrap break-words text-sm">{page.state.pastedBrief}</p>
    </div>
  );
}

/** Réponses aux questions ouvertes (facultatif) : « Régénérer le brief » n'est jamais automatique. */
function Questions({ page }: { page: FramingModel }) {
  const { state, view, change, patch, call, calls } = page;
  const questions = linesOf(state.brief?.openQuestions ?? "");
  if (state.mode !== "idea" || questions.length === 0) return null;
  if (!view.answering) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-[13px] text-muted-foreground">
          Répondre à ces questions améliore le brief.
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full md:h-9 md:w-auto"
          onClick={() => patch({ answering: true })}
        >
          Répondre aux questions
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {questions.map((question, index) => (
        <FramingTextField
          // biome-ignore lint/suspicious/noArrayIndexKey: questions ordonnées, sans identifiant propre
          key={index}
          id={`framing-answer-${index + 1}`}
          label={`Réponse ${index + 1}`}
          rows={2}
          help={question}
          maxLength={1000}
          value={state.answers[index] ?? ""}
          onChange={(value) => {
            const next = questions.map((_, i) => state.answers[i] ?? "");
            next[index] = value;
            change({ answers: next });
          }}
        />
      ))}
      <FramingCallButton
        id={IDS.callBrief}
        label="Régénérer le brief"
        busy={call.pending === "regenerate"}
        disabled={call.pending !== null || call.waiting}
        cancelled={call.cancelled && calls.lastKind() === "regenerate"}
        onClick={() => calls.generateBrief(true)}
        onCancel={() => {
          call.cancel();
          page.focusOn(IDS.callBrief);
        }}
      />
    </div>
  );
}

function Technical({ text }: { text: string }) {
  return (
    <Collapsible className="flex flex-col gap-1">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="h-11 justify-start px-2 md:h-9">
          <Icon name="terminal" size={16} />
          Détails techniques
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="px-2 font-mono text-xs text-muted-foreground">{text}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProposeButton({ page }: { page: FramingModel }) {
  const { call, calls, briefText, briefIssue } = page;
  return (
    <div className="flex flex-col gap-2">
      <AiSendPolicy />
      <FramingCallButton
        id={IDS.callPropose}
        label="Proposer des fonctionnalités avec l'IA"
        busy={call.pending === "propose"}
        disabled={briefText === "" || Boolean(briefIssue) || call.pending !== null || call.waiting}
        cancelled={call.cancelled && calls.lastKind() === "propose"}
        onClick={calls.propose}
        onCancel={() => {
          call.cancel();
          page.focusOn(IDS.callPropose);
        }}
      />
      {briefIssue ? <p className="text-[13px] text-destructive">{briefIssue}</p> : null}
    </div>
  );
}

/** Étape 2 « Le brief » (S-framing §3.4) : champs éditables, concaténés pour `ai.proposeFeatures`. */
export function FramingBriefStep({ page }: { page: FramingModel }) {
  const { state, view, call, calls } = page;
  const failed = call.error && calls.lastKind() !== "brief";
  const proposing = state.proposals.length === 0 && !view.emptyResult;
  return (
    <section
      aria-labelledby={IDS.stepBrief}
      aria-busy={call.pending === "regenerate" || call.pending === "propose" || undefined}
      className="flex flex-col gap-4"
    >
      <h2
        id={IDS.stepBrief}
        tabIndex={-1}
        className="text-[22px] font-semibold tracking-[-0.015em] outline-none"
      >
        2. Le brief
      </h2>
      {failed && call.error ? (
        <AiErrorNotice view={call.error} remaining={call.remaining} onRetry={call.retry} />
      ) : null}
      {state.mode === "idea" ? <BriefFieldsForm page={page} /> : <PastedBrief page={page} />}
      <Questions page={page} />
      {proposing ? <ProposeButton page={page} /> : null}
      <Button
        type="button"
        variant="ghost"
        className="h-11 w-full justify-start md:h-9 md:w-auto"
        onClick={() => {
          page.patch({ ideaCollapsed: false });
          page.focusOn(state.mode === "idea" ? IDS.idea : IDS.pastedBrief);
        }}
      >
        {state.mode === "idea" ? "Revenir à l'idée" : "Modifier le brief collé"}
      </Button>
      {view.technical ? <Technical text={view.technical} /> : null}
    </section>
  );
}
