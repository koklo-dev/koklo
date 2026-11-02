"use client";

import { useEffect, useMemo } from "react";
import type { AiErrorView } from "./ai-errors.ts";
import {
  briefText,
  COUNTER_ANNOUNCE_FROM,
  IDEA_MAX,
  validateBriefText,
  validateIdea,
} from "./framing-brief.ts";
import { IDS } from "./framing-ids.ts";
import { BUSY_TEXT, CHECKING_TEXT, countsText, thousands } from "./framing-labels.ts";
import { useAiCall } from "./use-ai-call.ts";
import { type Gate, useFramingAccess } from "./use-framing-access.ts";
import { useFramingCalls } from "./use-framing-calls.ts";
import { useFramingProposals } from "./use-framing-proposals.ts";
import { useFramingSave } from "./use-framing-save.ts";
import { useFramingState } from "./use-framing-state.ts";
import { useFramingView, type ViewModel } from "./use-framing-view.ts";

/** Texte annoncé pour la longueur de l'idée, à partir de 7 500 caractères seulement (jamais à chaque frappe). */
const counterAnnouncement = (length: number): string =>
  length >= COUNTER_ANNOUNCE_FROM
    ? `${thousands(length)} / ${thousands(IDEA_MAX)} caractères.`
    : "";

/** Texte de la région d'état unique : avancement, annonces, compteurs et enregistrement. */
function regionTextOf(parts: {
  gate: Gate;
  call: ReturnType<typeof useAiCall>;
  idea: string;
  notice: string;
  counts: string;
  saving: string;
}): string {
  return [
    parts.gate === "loading" ? CHECKING_TEXT : "",
    parts.call.pending ? BUSY_TEXT : "",
    parts.call.announcement,
    counterAnnouncement(parts.idea.length),
    parts.notice,
    parts.counts,
    parts.saving,
  ]
    .filter(Boolean)
    .join(" ");
}

/** FORBIDDEN et NOT_FOUND levés par un appel remplacent la page (S-framing §4.12). */
function gateAfterCalls(kind: string | undefined, gate: Gate): Gate {
  if (kind === "forbidden") return "forbidden";
  return kind === "not_found" ? "not-found" : gate;
}

/** L'échec d'un appel prend le focus, sauf collision de délimiteur : le champ concerné, sans écho du texte. */
function useErrorFocus(
  error: AiErrorView | null,
  calls: ReturnType<typeof useFramingCalls>,
  { patch, focusOn }: ViewModel,
): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: un nouvel échec (nouvel objet) déplace le focus
  useEffect(() => {
    if (!error) return;
    if (error.kind === "prompt_rejected" && error.field === "input") {
      if (calls.lastKind() !== "propose") patch({ ideaCollapsed: false });
      focusOn(calls.fieldToFix());
    } else focusOn(IDS.error);
  }, [error]);
}

/** Tout ce que pilote l'écran de cadrage : accès, saisie et brouillon, appels IA, propositions et enregistrement. */
export function useFramingPage(projectId: string) {
  const access = useFramingAccess(projectId);
  const { state, change, restored, discard } = useFramingState(projectId, access.gate === "ready");
  const viewModel = useFramingView();
  const call = useAiCall();
  const calls = useFramingCalls({ projectId, state, change, call, view: viewModel });
  const proposals = useFramingProposals(state.proposals, change, viewModel);
  const save = useFramingSave({
    projectId,
    role: access.role,
    spec: access.spec,
    accepted: proposals.accepted,
    change,
    view: viewModel,
  });
  useErrorFocus(call.error, calls, viewModel);

  const gate = gateAfterCalls(call.error?.kind, access.gate);
  const text = briefText(state);
  return {
    projectId,
    access,
    gate,
    state,
    change,
    restored,
    discard,
    view: viewModel.view,
    patch: viewModel.patch,
    focusOn: viewModel.focusOn,
    call,
    calls,
    proposals,
    save,
    briefText: text,
    briefIssue: validateBriefText(text),
    ideaIssues: useMemo(
      () => validateIdea(state.idea, state.clarifications),
      [state.idea, state.clarifications],
    ),
    regionText: regionTextOf({
      gate,
      call,
      idea: state.idea,
      notice: viewModel.view.notice,
      counts:
        state.proposals.length > 0
          ? countsText(proposals.accepted.length, state.proposals.length, proposals.rejected)
          : "",
      saving: save.statusText,
    }),
  };
}

export type FramingModel = ReturnType<typeof useFramingPage>;
