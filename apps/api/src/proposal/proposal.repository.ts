import type { AgentProposalKind, AgentProposalStatus } from "@koklo/domain";
import type { ProjectScope } from "../tracker/scope.ts";
import type { GroupCount, GroupFilter } from "./proposal-groups.ts";

export const PROPOSAL_REPOSITORY = Symbol("PROPOSAL_REPOSITORY");

export interface ProposalRecord {
  id: string;
  launchId: string;
  deliverable: string;
  kind: AgentProposalKind;
  zone: string;
  position: number;
  title: string;
  rationale: string;
  payload: Record<string, unknown>;
  status: AgentProposalStatus;
  appliedBatchId: string | null;
  /** TK-114g (B697) : création déjà présente dans la spec, réglée par le serveur (`status: "rejected"`). */
  discardReason: "already_present" | null;
  createdAt: Date;
}

export type Decision = "accept" | "reject" | "reset";

export interface ProposalQuery {
  launchId: string;
  pendingOnly: boolean;
  group: GroupFilter;
  limit: number;
  cursor?: string;
}

export interface ProposalWindow {
  rows: ProposalRecord[];
  offset: number;
  total: number;
  nextCursor: string | null;
  previousCursor: string | null;
}

/** Une proposition décidée, ou refusée parce qu'un lot de spec l'a déjà appliquée ou qu'elle est déjà présente (B701). */
export type DecideOutcome =
  | { kind: "decided"; proposal: ProposalRecord }
  | { kind: "applied" }
  | { kind: "present" }
  | { kind: "missing" };

/** Décision de groupe : appliquée, ou refusée parce que le N attendu n'est plus le N réel. */
export type DecideManyOutcome =
  | { kind: "decided"; decided: number }
  | { kind: "changed"; actual: number };

/** Contenu révisé d'une proposition : le titre suit le contenu, le motif et la zone restent. */
export interface RevisedContent {
  title: string;
  payload: Record<string, unknown>;
}

/** Accès aux propositions du projet ; toute lecture et toute décision est bornée au projet de la portée. */
export interface ProposalRepository {
  find(scope: ProjectScope, proposalId: string): Promise<ProposalRecord | null>;
  groupCounts(scope: ProjectScope, launchId: string): Promise<GroupCount[]>;
  window(scope: ProjectScope, query: ProposalQuery): Promise<ProposalWindow>;
  /** UNE transaction : relecture, état, journal. `edited` remplace le contenu (déjà validé par le service) ; une ligne d'audit. */
  decide(
    scope: ProjectScope,
    proposalId: string,
    decision: Decision,
    edited: RevisedContent | undefined,
  ): Promise<DecideOutcome>;
  /** UNE transaction : TOUTES les `pending` du groupe (chargées ou non) ; `expected` ≠ réel : rien n'est décidé ; une ligne d'audit. */
  decideMany(
    scope: ProjectScope,
    launchId: string,
    group: GroupFilter,
    expected: number,
  ): Promise<DecideManyOutcome>;
  /**
   * Créations du lancement pas encore réglées (TK-114g, B699) : `pending` ou `accepted`, non appliquées, sans motif, des
   * types `kinds`.
   */
  unsettledCreations(
    scope: ProjectScope,
    launchId: string,
    kinds: readonly AgentProposalKind[],
  ): Promise<ProposalRecord[]>;
  /** Règle `ids` déjà présentes (`rejected`, `already_present`), idempotent : seules les encore candidates changent. */
  settleAlreadyPresent(
    scope: ProjectScope,
    launchId: string,
    ids: readonly string[],
  ): Promise<number>;
  /** Remplace le contenu d'une proposition encore modifiable ; elle reste `pending`. `null` si elle a disparu. */
  revise(
    scope: ProjectScope,
    proposalId: string,
    content: RevisedContent,
  ): Promise<ProposalRecord | null>;
}
