import {
  type Prisma,
  type PrismaClient,
  type TenantClient,
  withOrganization,
  withTenantIsolation,
} from "@koklo/db";
import type { LaunchDiscardReason, LaunchStopReason } from "@koklo/domain";
import type { Complement, CoverageCounts, PublishedProposal } from "./coverage.ts";
import { type LaunchSources, readSources } from "./sources.ts";
import {
  claimSegment,
  launchProposalsIn,
  progressOf,
  publishCoverageIn,
  publishZoneIn,
} from "./store-report.ts";
import type { Candidate } from "./triage.ts";

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

const json = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * Accès base du job `agent-propose`. Le lancement n'est connu que par son identifiant : l'organisation se lit d'abord
 * par le client brut (seule lecture hors contexte), tout le reste passe par le client multi-tenant sous
 * `withOrganization`. Chaque méthode est une requête courte : aucune transaction ne reste ouverte pendant un appel
 * au modèle. Le magasin n'écrit que `agent_launches`, `agent_proposals` et `notifications`.
 */
export class AgentProposeStore implements ProposeStore {
  readonly client: TenantClient;

  private readonly raw: PrismaClient;

  private readonly clock: () => Date;

  constructor(raw: PrismaClient, clock: () => Date = () => new Date()) {
    this.raw = raw;
    this.clock = clock;
    this.client = withTenantIsolation(raw);
  }

  private inOrganization<T>(launch: LaunchContext, work: () => Promise<T>): Promise<T> {
    return withOrganization(launch.organizationId, work);
  }

  /**
   * Prise d'un job : sans `segment`, le premier (`queued` → `running` ; déjà `running` : perdu). Avec `segment`, un job de
   * suite : seul celui du segment attendu, après un passage de relais (`handoff_at` posé), reprend ; un job repris par
   * pg-boss après une vraie perte trouve le relais déjà pris et reste perdu (B617).
   */
  async claim(launchId: string, segment?: number): Promise<Claim> {
    const owner = await this.raw.agentLaunch.findUnique({
      where: { id: launchId },
      select: { organizationId: true },
    });
    if (!owner) return { kind: "gone" };
    return withOrganization(owner.organizationId, async () => {
      const row = await this.client.agentLaunch.findFirst({ where: { id: launchId } });
      if (!row) return { kind: "gone" };
      const launch: LaunchContext = {
        id: row.id,
        organizationId: row.organizationId,
        projectId: row.projectId,
        deliverable: row.deliverable,
        mode: row.mode,
        instruction: row.instruction,
        requestedBy: row.requestedBy,
        baseVersion: row.baseVersion,
      };
      const now = this.clock();
      if (segment !== undefined) return claimSegment(this.client, row, launch, segment, now);
      if (row.status === "running") return { kind: "lost", launch };
      if (row.status !== "queued") return { kind: "settled" };
      const { count } = await this.client.agentLaunch.updateMany({
        where: { id: launchId, status: "queued" },
        data: { status: "running", startedAt: now, heartbeatAt: now },
      });
      return count === 0
        ? { kind: "settled" }
        : { kind: "ready", launch, progress: progressOf(row) };
    });
  }

  sources(launch: LaunchContext): Promise<LaunchSources | null> {
    return readSources(this.client, launch);
  }

  /** Données en UE du projet ; projet introuvable : la restriction s'applique (le plus prudent). */
  euOnly(launch: LaunchContext): Promise<boolean> {
    return this.inOrganization(launch, async () => {
      const project = await this.client.project.findFirst({
        where: { id: launch.projectId },
        select: { euOnly: true },
      });
      return project === null ? true : project.euOnly;
    });
  }

  heartbeat(launch: LaunchContext): Promise<void> {
    return this.inOrganization(launch, async () => {
      await this.client.agentLaunch.updateMany({
        where: { id: launch.id, status: "running" },
        data: { heartbeatAt: this.clock() },
      });
    });
  }

  /** Zones validées de l'étape 1 (une fois) et couverture de l'index avant le lancement (Architecture). */
  recordZones(
    launch: LaunchContext,
    zones: readonly string[],
    before?: CoverageCounts,
  ): Promise<PublishOutcome> {
    return this.inOrganization(launch, async () => {
      const { count } = await this.client.agentLaunch.updateMany({
        where: { id: launch.id, status: "running" },
        data: {
          zones: json(zones),
          ...(before === undefined ? {} : { coverageBefore: json(before) }),
          heartbeatAt: this.clock(),
        },
      });
      return count === 0 ? "stopped" : "published";
    });
  }

  /**
   * Publie une zone en UNE transaction : propositions `pending` à la suite des positions déjà publiées, compteurs, motif et
   * battement du lancement. La relecture peut donc commencer avant la fin de la génération.
   */
  publishZone(launch: LaunchContext, publication: ZonePublication): Promise<PublishOutcome> {
    return this.inOrganization(launch, () =>
      this.client.$transaction((tx) => publishZoneIn(tx, launch, publication, this.clock())),
    );
  }

  /** Publie un appel de couverture ou la règle des tables en UNE transaction : créations et compléments (B621). */
  publishCoverage(
    launch: LaunchContext,
    publication: CoveragePublication,
  ): Promise<PublishOutcome> {
    return this.inOrganization(launch, () =>
      this.client.$transaction((tx) => publishCoverageIn(tx, launch, publication, this.clock())),
    );
  }

  /** Couverture après la dernière publication ; `stalled` : appels consécutifs sans trou comblé (passe de couverture). */
  recordCoverage(launch: LaunchContext, after: CoverageCounts, stalled?: number): Promise<void> {
    return this.inOrganization(launch, async () => {
      await this.client.agentLaunch.updateMany({
        where: { id: launch.id },
        data: {
          coverageAfter: json(after),
          ...(stalled === undefined ? {} : { coverageStalled: stalled }),
        },
      });
    });
  }

  launchProposals(launch: LaunchContext): Promise<PublishedProposal[]> {
    return this.inOrganization(launch, () => launchProposalsIn(this.client, launch));
  }

  /** Passage de relais (B617) : segment suivant, `handoff_at` posé, battement ; `false` si le lancement n'est plus le nôtre. */
  handoff(launch: LaunchContext, segment: number): Promise<boolean> {
    return this.inOrganization(launch, async () => {
      const now = this.clock();
      const { count } = await this.client.agentLaunch.updateMany({
        where: { id: launch.id, status: "running", segment },
        data: { segment: segment + 1, handoffAt: now, heartbeatAt: now },
      });
      return count === 1;
    });
  }

  finish(launch: LaunchContext, reason: "completed" | "cap"): Promise<void> {
    return this.settle(launch, { status: "done", stopReason: reason });
  }

  fail(launch: LaunchContext, errorCode: string, reason?: LaunchStopReason): Promise<void> {
    return this.settle(launch, { status: "failed", errorCode, stopReason: reason ?? null });
  }

  /** Lancement trouvé `canceled` à la publication : motif `cancelled` (B618). */
  cancelled(launch: LaunchContext): Promise<void> {
    return this.inOrganization(launch, async () => {
      await this.client.agentLaunch.updateMany({
        where: { id: launch.id, status: "canceled", stopReason: null },
        data: { stopReason: "cancelled" },
      });
    });
  }

  private settle(
    launch: LaunchContext,
    outcome:
      | { status: "done"; stopReason: LaunchStopReason }
      | { status: "failed"; errorCode: string; stopReason: LaunchStopReason | null },
  ): Promise<void> {
    return this.inOrganization(launch, async () => {
      await this.client.agentLaunch.updateMany({
        where: { id: launch.id, status: { in: ["queued", "running"] } },
        data: { ...outcome, handoffAt: null, finishedAt: this.clock() },
      });
    });
  }

  times(launch: LaunchContext): Promise<LaunchTimes> {
    return this.inOrganization(launch, async () => {
      const row = await this.client.agentLaunch.findFirst({
        where: { id: launch.id },
        select: { lastSeenAt: true, startedAt: true },
      });
      return { lastSeenAt: row?.lastSeenAt ?? null, startedAt: row?.startedAt ?? null };
    });
  }

  /** Notification `proposal.ready` sans e-mail (`skipped`), une seule par lancement (`dedupeKey = launchId`). */
  notifyReady(launch: LaunchContext): Promise<void> {
    return this.inOrganization(launch, async () => {
      await this.client.notification.create({
        data: {
          organizationId: launch.organizationId,
          recipientUserId: launch.requestedBy,
          type: "proposal.ready",
          projectId: launch.projectId,
          subjectKind: "agent_launch",
          subjectRef: launch.id,
          dedupeKey: launch.id,
          emailState: "skipped",
        },
      });
    });
  }
}
