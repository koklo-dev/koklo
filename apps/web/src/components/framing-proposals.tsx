import { Alert, Button, Icon } from "@koklo/ui";
import { useEffect, useRef } from "react";
import { IDS } from "../lib/framing-ids.ts";
import type { FramingModel } from "../lib/use-framing-page.ts";
import { AiSendPolicy } from "./ai-send-policy.tsx";
import { FramingCallButton } from "./framing-call-button.tsx";
import { FramingProposalCard } from "./framing-proposal-card.tsx";
import { FramingSaveFailure } from "./framing-save-failure.tsx";
import { FramingSubmitBar } from "./framing-submit-bar.tsx";

function Empty({ page }: { page: FramingModel }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border bg-card p-4 text-card-foreground">
      <p className="font-medium">L'IA n'a proposé aucune fonctionnalité nouvelle.</p>
      <p className="text-sm text-muted-foreground">Précisez le brief et réessayez.</p>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full md:h-9 md:w-auto"
        onClick={() => {
          page.patch({ emptyResult: false });
          page.focusOn(page.state.mode === "idea" ? IDS.briefTitle : IDS.pastedBrief);
        }}
      >
        Revenir au brief
      </Button>
    </div>
  );
}

/** « Les propositions actuelles seront remplacées. » : confirmation en ligne, focus sur « Garder ». */
function ReplaceConfirm({ page }: { page: FramingModel }) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  const close = () => {
    page.patch({ replacing: false });
    page.focusOn(IDS.callPropose);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: confirmation en ligne nommée, ni fieldset ni modale
    <div
      role="group"
      aria-label="Remplacer les propositions"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <p className="font-medium">Les propositions actuelles seront remplacées.</p>
      <AiSendPolicy />
      <div className="flex flex-col gap-2 md:flex-row">
        <Button
          type="button"
          className="h-11 md:h-9"
          onClick={() => {
            page.patch({ replacing: false });
            page.calls.propose();
          }}
        >
          Remplacer
        </Button>
        <Button ref={keep} type="button" variant="outline" className="h-11 md:h-9" onClick={close}>
          Garder
        </Button>
      </div>
    </div>
  );
}

function AskAgain({ page }: { page: FramingModel }) {
  const { call, calls, view } = page;
  if (view.replacing) return <ReplaceConfirm page={page} />;
  return (
    <FramingCallButton
      id={IDS.callPropose}
      label="Proposer d'autres fonctionnalités"
      busy={call.pending === "propose"}
      disabled={call.pending !== null || call.waiting || page.briefText === ""}
      cancelled={call.cancelled && calls.lastKind() === "propose"}
      onClick={() => page.patch({ replacing: true })}
      onCancel={() => {
        call.cancel();
        page.focusOn(IDS.callPropose);
      }}
    />
  );
}

/** Étape 3 « Les propositions » (S-framing §3.5) : cartes en texte brut, barre d'enregistrement, relance. */
export function FramingProposalsStep({ page }: { page: FramingModel }) {
  const { state, call, proposals, save, projectId } = page;
  const announce = (notice: string) => page.patch({ notice });
  return (
    <section
      aria-labelledby={IDS.stepProposals}
      aria-busy={call.pending === "propose" || undefined}
      className="flex flex-col gap-4"
    >
      <h2
        id={IDS.stepProposals}
        tabIndex={-1}
        className="text-[22px] font-semibold tracking-[-0.015em] outline-none"
      >
        3. Les propositions
      </h2>
      {state.proposals.length === 0 ? (
        <Empty page={page} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Relisez chaque proposition. Rien n'est accepté par défaut.
          </p>
          {proposals.allDuplicates ? (
            <Alert role="alert">
              <Icon name="warning" size={20} />
              <p>Toutes ces propositions ressemblent à des fonctionnalités existantes.</p>
            </Alert>
          ) : null}
          <ol className="flex flex-col gap-4">
            {state.proposals.map((proposal) => (
              <FramingProposalCard
                key={proposal.id}
                projectId={projectId}
                proposal={proposal}
                actions={proposals}
                locked={save.busy}
                announce={announce}
              />
            ))}
          </ol>
          <FramingSaveFailure page={page} />
          <FramingSubmitBar page={page} />
          <AskAgain page={page} />
        </>
      )}
    </section>
  );
}
