import type { ReviewVerdict } from "../client-space/validation.ts";
import type { ShellFacts } from "../project/project-shell.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { ActivityRow } from "./overview-activity.ts";
import type { IdeaPageFact, MemberFact, TicketFact } from "./overview-main.ts";

export const PROJECT_OVERVIEW_REPOSITORY = Symbol("PROJECT_OVERVIEW_REPOSITORY");

export type Audience = "team" | "client";

/** Tout ce que la vue d'ensemble lit, en une transaction : des faits, jamais un texte. */
export interface OverviewRecord {
  project: { id: string; name: string; createdAt: Date };
  phaseFacts: ShellFacts;
  /** Date de la baseline posée ; `null` tant qu'aucune ne l'est. */
  baselineAt: Date | null;
  ideaVersion: { number: number; tag: string; frozenAt: Date } | null;
  pages: IdeaPageFact[];
  pendingProposals: number;
  /** Auteur du dernier message humain du fil de l'Idée, nommé dans la règle 3 ; `null` s'il n'a pas de compte. */
  proposalAuthor: string | null;
  /** Messages du client cette semaine ; `null` sans client lié. */
  clientMessages: number | null;
  clients: MemberFact[];
  staff: MemberFact[];
  spec: {
    failed: boolean;
    head: { sha: string; indexedAt: Date; versions: number } | null;
    /** Dernière review de chaque fonctionnalité de la version courante. */
    verdicts: (ReviewVerdict | undefined)[];
  };
  suggestions: { open: number; first: { key: string; body: string } | null };
  sprint: { key: string; goal: string; tickets: TicketFact[] } | null;
  /** `null` si la lecture n'a pas été demandée (réservée aux propriétaires et administrateurs). */
  aiConfigured: boolean | null;
  activity: ActivityPage;
}

export interface ActivityPage {
  rows: ActivityRow[];
  total: number;
  offset: number;
  nextCursor: string | null;
}

export interface OverviewQuery {
  audience: Audience;
  now: Date;
  /** Lire l'état de l'IA : seuls les propriétaires et administrateurs voient la règle 1. */
  withAi: boolean;
}

export interface ProjectOverviewRepository {
  overview(scope: ProjectScope, query: OverviewQuery): Promise<OverviewRecord>;
  activity(
    scope: ProjectScope,
    audience: Audience,
    page: { cursor: string | undefined; limit: number },
  ): Promise<ActivityPage>;
}
