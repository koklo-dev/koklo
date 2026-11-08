import type { ProjectScope } from "../tracker/scope.ts";
import type { IdeaProposalOp, IdeaProposalRecord } from "./idea-proposal.repository.ts";

export const IDEA_AGENT_REPOSITORY = Symbol("IDEA_AGENT_REPOSITORY");

export type IdeaMode = "interview" | "free";
export type IdeaAuthorKind = "team" | "client" | "agent";

/** Une page du dossier avec son contenu : ce que l'agent lit (jamais renvoyé tel quel au client). */
export interface IdeaContextPage {
  id: string;
  title: string;
  templateKey: string | null;
  contentMd: string;
  version: number;
}

/** Ce que l'agent sait du dossier au moment d'un appel. `messages` : les derniers, du plus ancien au plus récent. */
export interface IdeaAgentContext {
  pages: IdeaContextPage[];
  focus: IdeaContextPage | undefined;
  messages: { author: IdeaAuthorKind; text: string }[];
  /** Réponses humaines sur la page ouverte depuis sa dernière proposition (le message courant non compris). */
  answers: number;
}

export interface IdeaMessageRecord {
  id: string;
  pageId: string | null;
  /** `null` : l'agent. Un ancien membre reste un nom (jamais un identifiant). */
  author: { name: string; isClient: boolean } | null;
  mode: IdeaMode;
  text: string;
  createdAt: Date;
}

export interface IdeaMessagePage {
  items: IdeaMessageRecord[];
  nextCursor: string | null;
  total: number;
  offset: number;
}

/** Une proposition validée du modèle, prête à être stockée. */
export interface IdeaProposalDraft {
  op: IdeaProposalOp;
  anchorBlockIndex: number | null;
  rangeEnd: number | null;
  title: string | null;
  contentMd: string;
  rationale: string;
}

export interface IdeaExchange {
  /** Page de contexte (`null` : le dossier entier) et sa version lue avec le contexte. */
  pageId: string | null;
  baseVersion: number | null;
  mode: IdeaMode;
  humanText: string;
  agentText: string;
  proposals: IdeaProposalDraft[];
}

export interface IdeaGapItem {
  pageId: string | null;
  suggestedPageTitle: string | null;
  text: string;
}

export interface IdeaGapRunRecord {
  computedAt: Date;
  items: IdeaGapItem[];
}

/**
 * Agent de l'espace Idée : fil, verrou d'appel, dernier calcul des manques (TK-90). Le verrou et les manques n'ont
 * aucun lien avec un modèle : le service décide, le dépôt écrit.
 */
export interface IdeaAgentRepository {
  /** Pages, fil et réponses ; `NOT_FOUND` si `pageId` n'est pas une page active du projet. */
  context(scope: ProjectScope, pageId: string | undefined): Promise<IdeaAgentContext>;
  /** Prend le verrou (projet, utilisateur) pour `ttlMs`, ou le reprend s'il a expiré ; `null` si un autre appel le tient. */
  tryLock(scope: ProjectScope, now: Date, ttlMs: number): Promise<Date | null>;
  /** Libère le verrou pris avec ce jeton (un verrou repris entre-temps n'est pas touché). */
  unlock(scope: ProjectScope, token: Date): Promise<void>;
  /** Écrit le message humain, la réponse de l'agent et ses propositions en une transaction. */
  recordExchange(
    scope: ProjectScope,
    exchange: IdeaExchange,
  ): Promise<{ messageId: string; proposals: IdeaProposalRecord[] }>;
  messages(
    scope: ProjectScope,
    query: { cursor?: string | undefined; limit: number },
  ): Promise<IdeaMessagePage>;
  gapRun(scope: ProjectScope): Promise<IdeaGapRunRecord | null>;
  saveGapRun(scope: ProjectScope, run: IdeaGapRunRecord): Promise<void>;
}
