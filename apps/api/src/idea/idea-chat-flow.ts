import type { AiIdeaChatEvent, AiIdeaChatInput } from "@koklo/contract";
import { outputInvalid } from "../ai/ai-errors.ts";
import type { IdeaPromptContext } from "../ai/ai-idea-prompts.ts";
import { isSafeText } from "../ai/ai-text-policy.ts";
import type { IdeaAgentContext, IdeaProposalDraft } from "./idea-agent.repository.ts";
import { hasBlock } from "./idea-markdown-ops.ts";

/** Texte d'un message : 4 000 caractères au plus (B227). */
export const IDEA_MESSAGE_MAX = 4000;

/** Actions pour lesquelles l'agent propose du contenu ; les autres (Challenger, Trouver les trous) n'écrivent que le message. */
const PROPOSING_ACTIONS: ReadonlySet<string> = new Set(["develop", "simplify", "make_page"]);
/** En entretien : une proposition dès 2 réponses humaines sur la page depuis la dernière (B220). */
const ANSWERS_BEFORE_PROPOSAL = 2;

export function wantsProposals(input: AiIdeaChatInput, context: IdeaAgentContext): boolean {
  if (input.action !== undefined) return PROPOSING_ACTIONS.has(input.action);
  return (
    input.mode === "interview" &&
    context.focus !== undefined &&
    context.answers + 1 >= ANSWERS_BEFORE_PROPOSAL
  );
}

/** Le contexte tel que le modèle le lit : titres, contenus, fil étiqueté (jamais un identifiant ni un nom). */
export const promptContextOf = (context: IdeaAgentContext): IdeaPromptContext => ({
  pages: context.pages,
  focus: context.focus,
  messages: context.messages,
});

/**
 * Cohérence des propositions avec la page ouverte : une ancre vise un bloc qui existe, `append` n'a pas d'ancre,
 * `create_page` a un titre. Toute incohérence refuse la sortie entière (LLM_OUTPUT_INVALID, rien n'est stocké).
 */
export function checkedDrafts(
  drafts: readonly IdeaProposalDraft[],
  context: IdeaAgentContext,
): IdeaProposalDraft[] {
  return drafts.map((draft) => {
    if (draft.op === "create_page") {
      if (draft.title === null) throw outputInvalid();
      return { ...draft, anchorBlockIndex: null, rangeEnd: null };
    }
    const page = context.focus;
    if (page === undefined) throw outputInvalid();
    if (draft.op === "append")
      return { ...draft, anchorBlockIndex: null, rangeEnd: null, title: null };
    const anchor = draft.anchorBlockIndex;
    if (anchor === null || !hasBlock(page.contentMd, anchor, draft.rangeEnd)) throw outputInvalid();
    return { ...draft, rangeEnd: draft.op === "replace" ? draft.rangeEnd : null, title: null };
  });
}

/**
 * Relaie le texte du modèle comme évènements `text` en le filtrant AVANT de l'envoyer : le texte cumulé doit rester
 * conforme à la politique de contenu (un motif coupé en deux morceaux est vu au second). Un message trop long est
 * coupé. Rend le texte complet.
 */
export async function* relayText(
  source: AsyncGenerator<string, unknown>,
): AsyncGenerator<AiIdeaChatEvent, string> {
  let text = "";
  for (let next = await source.next(); !next.done; next = await source.next()) {
    const piece = next.value.slice(0, IDEA_MESSAGE_MAX - text.length);
    if (!isSafeText(text + piece, true)) {
      await source.return(undefined);
      throw outputInvalid();
    }
    text += piece;
    if (piece !== "") yield { type: "text", text: piece };
    if (text.length >= IDEA_MESSAGE_MAX) {
      await source.return(undefined);
      break;
    }
  }
  if (text.trim() === "") throw outputInvalid();
  return text;
}
