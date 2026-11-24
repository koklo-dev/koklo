import type { LaunchDiscardReason, LaunchStopReason } from "@koklo/domain";
import type { Complement, CoverageCounts, PublishedProposal } from "./coverage.ts";
import type { LaunchSources } from "./sources.ts";
import type { Candidate } from "./triage.ts";

/** Types du magasin du job `agent-propose`, séparés de `AgentProposeStore` (store.ts) pour la taille. */
export type { CoverageCounts } from "./coverage.ts";

/** Ce que le job sait d'un lancement : jamais un secret, jamais le texte du modèle. */
export interface LaunchContext {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly deliverable: string;
  readonly mode: string;
  readonly instruction: string | null;
  readonly requestedBy: string;
  readonly baseVersion: number | null;
}

/** Progression stockée d'un lancement (TK-114b, B617) : le segment suivant reprend aux zones restantes ou à la couverture. */
export interface LaunchProgress {
  readonly segment: number;
  readonly zones: readonly string[];
  readonly zonesDone: number;
  readonly zonesDiscarded: number;
  readonly coverageCalls: number;
  /** Appels de couverture consécutifs sans trou comblé, d'un segment à l'autre. */
  readonly coverageStalled: number;
}

export type Claim =
  | { readonly kind: "ready"; readonly launch: LaunchContext; readonly progress: LaunchProgress }
  | { readonly kind: "lost"; readonly launch: LaunchContext }
  | { readonly kind: "settled" }
  | { readonly kind: "gone" };

/** `stopped` : le lancement n'est plus `running` (annulé, repris) ; rien n'a été publié. */
export type PublishOutcome = "published" | "stopped";

export interface LaunchTimes {
  readonly lastSeenAt: Date | null;
  readonly startedAt: Date | null;
}

/** Une zone publiée : propositions gardées, entrées écartées, motif si la zone entière est écartée (B618). */
export interface ZonePublication {
  readonly zone: string;
  readonly accepted: readonly Candidate[];
  readonly discarded: number;
  readonly reason?: LaunchDiscardReason;
  /** Sections écartées parce que leur identifiant existe déjà (TK-114e) : `discard_reasons.existing_section`. */
  readonly existingSections?: number;
}

/** Une publication de la couverture ou de la règle des tables : créations, compléments, appel compté ou non. */
export interface CoveragePublication {
  readonly accepted: readonly Candidate[];
  readonly complements: readonly Complement[];
  readonly discarded: number;
  readonly call: boolean;
}

/** Ce que la génération attend du magasin (le vrai, ou un faux en mémoire pour les tests de volume). */
export interface ProposeStore {
  claim(launchId: string, segment?: number): Promise<Claim>;
  sources(launch: LaunchContext): Promise<LaunchSources | null>;
  euOnly(launch: LaunchContext): Promise<boolean>;
  heartbeat(launch: LaunchContext): Promise<void>;
  recordZones(
    launch: LaunchContext,
    zones: readonly string[],
    before?: CoverageCounts,
  ): Promise<PublishOutcome>;
  publishZone(launch: LaunchContext, publication: ZonePublication): Promise<PublishOutcome>;
  publishCoverage(launch: LaunchContext, publication: CoveragePublication): Promise<PublishOutcome>;
  recordCoverage(launch: LaunchContext, after: CoverageCounts, stalled?: number): Promise<void>;
  launchProposals(launch: LaunchContext): Promise<PublishedProposal[]>;
  handoff(launch: LaunchContext, segment: number): Promise<boolean>;
  finish(launch: LaunchContext, reason: "completed" | "cap"): Promise<void>;
  fail(launch: LaunchContext, errorCode: string, reason?: LaunchStopReason): Promise<void>;
  cancelled(launch: LaunchContext): Promise<void>;
  times(launch: LaunchContext): Promise<LaunchTimes>;
  notifyReady(launch: LaunchContext): Promise<void>;
}
