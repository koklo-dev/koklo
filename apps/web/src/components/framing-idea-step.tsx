import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@koklo/ui";
import { useState } from "react";
import { BRIEF_MAX, EMPTY_BRIEF, IDEA_MAX, validateBriefText } from "../lib/framing-brief.ts";
import { IDS } from "../lib/framing-ids.ts";
import type { FramingModel } from "../lib/use-framing-page.ts";
import { AiErrorNotice } from "./ai-error-notice.tsx";
import { AiSendPolicy } from "./ai-send-policy.tsx";
import { FramingCallButton } from "./framing-call-button.tsx";
import { FramingTextField } from "./framing-text-field.tsx";

const HELP_IDEA =
  "Décrivez le besoin en quelques phrases : qui, quel problème, ce que vous attendez.";
const REASON_ID = "framing-idea-reason";

function Clarifications({ page }: { page: FramingModel }) {
  const { state, change, ideaIssues } = page;
  const [open, setOpen] = useState(state.clarifications !== "");
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-2">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="h-11 justify-start px-2 md:h-9">
          <Icon name={open ? "keyboard_arrow_up" : "keyboard_arrow_down"} size={20} />
          Ajouter des précisions (facultatif)
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <FramingTextField
          id={IDS.clarifications}
          label="Précisions"
          rows={3}
          value={state.clarifications}
          onChange={(clarifications) => change({ clarifications })}
          help="Une précision par ligne (10 au plus, 1 000 caractères chacune)."
          error={ideaIssues.clarifications}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Chemin « Partir d'une idée » : l'idée, les précisions, puis `ai.draftBrief`. */
function IdeaPath({ page }: { page: FramingModel }) {
  const { state, change, call, calls, ideaIssues } = page;
  const blank = state.idea.trim() === "";
  const invalid = Boolean(ideaIssues.idea || ideaIssues.clarifications);
  const generate = () => {
    if (!invalid) return calls.generateBrief(false);
    page.focusOn(ideaIssues.idea ? IDS.idea : IDS.clarifications);
  };
  return (
    <div className="flex flex-col gap-4">
      <FramingTextField
        id={IDS.idea}
        label="Votre idée"
        rows={6}
        value={state.idea}
        onChange={(idea) => change({ idea })}
        help={HELP_IDEA}
        max={IDEA_MAX}
        error={ideaIssues.idea}
      />
      <Clarifications page={page} />
      <AiSendPolicy />
      {blank ? (
        <p id={REASON_ID} className="text-[13px] text-muted-foreground">
          Écrivez votre idée pour continuer.
        </p>
      ) : null}
      <FramingCallButton
        id={IDS.callBrief}
        label="Générer un brief avec l'IA"
        busy={call.pending === "brief"}
        disabled={blank || call.pending !== null || call.waiting}
        reasonId={blank ? REASON_ID : undefined}
        cancelled={call.cancelled && calls.lastKind() === "brief"}
        onClick={generate}
        onCancel={() => {
          call.cancel();
          page.focusOn(IDS.callBrief);
        }}
      />
    </div>
  );
}

/** Chemin « J'ai déjà un brief » : aucun appel IA, le brief collé alimente l'étape 2. */
function BriefPath({ page }: { page: FramingModel }) {
  const { state, change, patch, focusOn } = page;
  const tooLong = state.pastedBrief.length > BRIEF_MAX;
  const review = () => {
    if (tooLong) return focusOn(IDS.pastedBrief);
    change({ brief: EMPTY_BRIEF });
    patch({ notice: "" });
    focusOn(IDS.stepBrief);
  };
  return (
    <div className="flex flex-col gap-4">
      <FramingTextField
        id={IDS.pastedBrief}
        label="Votre brief"
        rows={10}
        value={state.pastedBrief}
        onChange={(pastedBrief) => change({ pastedBrief })}
        help="Collez un brief déjà rédigé : il sera relu ici, sans appel à l'IA."
        max={BRIEF_MAX}
        error={tooLong ? validateBriefText(state.pastedBrief) : undefined}
      />
      <AiSendPolicy />
      <Button
        type="button"
        className="h-11 w-full md:h-9 md:w-auto"
        disabled={state.pastedBrief.trim() === ""}
        onClick={review}
      >
        Relire le brief
      </Button>
    </div>
  );
}

function IdeaSummary({ page }: { page: FramingModel }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm">{`Idée de ${page.state.idea.length} caractères`}</p>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full md:h-9 md:w-auto"
        onClick={() => {
          page.patch({ ideaCollapsed: false });
          page.focusOn(IDS.idea);
        }}
      >
        Modifier
      </Button>
    </div>
  );
}

/** Étape 1 « Votre idée » (S-framing §3.3) : reste en place, repliée en résumé une fois le brief produit. */
export function FramingIdeaStep({ page }: { page: FramingModel }) {
  const { state, view, call, calls } = page;
  const collapsed = state.mode === "idea" && state.brief !== null && view.ideaCollapsed;
  const failed = call.error && calls.lastKind() === "brief";
  return (
    <section
      aria-labelledby="framing-heading-idea"
      aria-busy={call.pending === "brief" || undefined}
      className="flex flex-col gap-4"
    >
      <h2 id="framing-heading-idea" className="text-[22px] font-semibold tracking-[-0.015em]">
        1. Votre idée
      </h2>
      {failed && call.error ? (
        <AiErrorNotice view={call.error} remaining={call.remaining} onRetry={calls.retry} />
      ) : null}
      {collapsed ? (
        <IdeaSummary page={page} />
      ) : (
        <Tabs
          value={state.mode}
          onValueChange={(mode) => page.change({ mode: mode as "idea" | "brief" })}
        >
          <TabsList className="h-auto w-full md:w-auto">
            <TabsTrigger value="idea" className="h-11 flex-1 md:h-9 md:flex-none">
              Partir d'une idée
            </TabsTrigger>
            <TabsTrigger value="brief" className="h-11 flex-1 md:h-9 md:flex-none">
              J'ai déjà un brief
            </TabsTrigger>
          </TabsList>
          <TabsContent value="idea" className="mt-4">
            <IdeaPath page={page} />
          </TabsContent>
          <TabsContent value="brief" className="mt-4">
            <BriefPath page={page} />
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
