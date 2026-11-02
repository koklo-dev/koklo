"use client";

import { featureIdSchema } from "@koklo/contract";
import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { answersOf, briefFromAi, briefText, EMPTY_BRIEF, linesOf } from "./framing-brief.ts";
import { IDS } from "./framing-ids.ts";
import { BRIEF_READY_TEXT, proposalsReadyText } from "./framing-labels.ts";
import type { FramingDraft, FramingProposal, ProposedFeature } from "./framing-types.ts";
import { orpc } from "./orpc.ts";
import type { AiCall } from "./use-ai-call.ts";
import type { Change } from "./use-framing-state.ts";
import type { ViewModel } from "./use-framing-view.ts";

interface Meta {
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}
interface ProposalsOutput {
  features: ProposedFeature[];
  duplicates: Array<{ index: number; specId: string }>;
  meta: Meta;
}

const technicalLine = ({ model, usage }: Meta): string =>
  `Modèle : ${model} · ${usage.inputTokens} / ${usage.outputTokens} jetons`;

let counter = 0;
const newProposalId = (): string => `p-${Date.now().toString(36)}-${++counter}`;

/** Propositions reçues : toutes « À relire », doublons signalés par un identifiant `F-nnn` validé. */
export function toProposals(output: Pick<ProposalsOutput, "features" | "duplicates">) {
  return output.features.map((feature, index): FramingProposal => {
    const specId = output.duplicates.find((duplicate) => duplicate.index === index)?.specId;
    return {
      id: newProposalId(),
      status: "to_review",
      value: feature,
      original: feature,
      duplicateOf:
        specId !== undefined && featureIdSchema.safeParse(specId).success ? specId : null,
    };
  });
}

/** Idée et précisions envoyées à `ai.draftBrief` ; à la régénération, avec les réponses aux questions. */
function briefInput(projectId: string, state: FramingDraft, regenerate: boolean) {
  const answers = regenerate
    ? [...linesOf(state.clarifications), ...answersOf(state.answers)].slice(0, 10)
    : linesOf(state.clarifications);
  return { projectId, idea: state.idea.trim(), ...(answers.length > 0 ? { answers } : {}) };
}

/** Nature d'un appel : `brief` (étape 1), `regenerate` (étape 2, avec les réponses), `propose` (étape 2). */
type CallKind = "brief" | "regenerate" | "propose";

interface CallsOptions {
  projectId: string;
  state: FramingDraft;
  change: Change;
  call: AiCall;
  view: ViewModel;
}

/**
 * Les deux appels IA de l'écran : brief (idée -> brief) et propositions (brief -> fonctionnalités). Un clic est au
 * plus un appel ; une sortie ne crée jamais rien (S-framing §5.1, §5.2).
 */
export function useFramingCalls({ projectId, state, change, call, view }: CallsOptions) {
  const draftBrief = useMutation(orpc.ai.draftBrief.mutationOptions());
  const proposeFeatures = useMutation(orpc.ai.proposeFeatures.mutationOptions());
  const lastKind = useRef<CallKind>("brief");
  const { patch, focusOn } = view;

  const generateBrief = (regenerate: boolean) => {
    lastKind.current = regenerate ? "regenerate" : "brief";
    call.run(
      lastKind.current,
      () => draftBrief.mutateAsync(briefInput(projectId, state, regenerate)),
      (output) => {
        change({ brief: briefFromAi(output.brief), answers: [] });
        patch({
          aiFields: Object.keys(EMPTY_BRIEF) as Array<keyof typeof EMPTY_BRIEF>,
          technical: technicalLine(output.meta),
          ideaCollapsed: state.mode === "idea",
          answering: regenerate,
          notice: BRIEF_READY_TEXT,
        });
        focusOn(IDS.stepBrief);
      },
    );
  };

  const propose = () => {
    lastKind.current = "propose";
    call.run(
      "propose",
      () => proposeFeatures.mutateAsync({ projectId, brief: briefText(state) }),
      (output) => {
        const proposals = toProposals(output);
        change({ proposals });
        patch({
          technical: technicalLine(output.meta),
          emptyResult: proposals.length === 0,
          replacing: false,
          confirming: false,
          notice: proposals.length > 0 ? proposalsReadyText(proposals.length) : "",
        });
        focusOn(IDS.stepProposals);
      },
    );
  };

  return {
    generateBrief,
    propose,
    /** Champ à qui rendre le focus quand le texte saisi est refusé (collision de délimiteur). */
    fieldToFix: (): string => {
      if (lastKind.current !== "propose") return IDS.idea;
      return state.mode === "brief" ? IDS.pastedBrief : IDS.briefTitle;
    },
    lastKind: () => lastKind.current,
  };
}
