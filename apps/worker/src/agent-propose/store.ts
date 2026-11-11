import {
  type Prisma,
  type PrismaClient,
  type TenantClient,
  withOrganization,
  withTenantIsolation,
} from "@koklo/db";
import { rowsOf } from "./publish.ts";
import { type LaunchSources, readSources } from "./sources.ts";
import type { Candidate } from "./triage.ts";

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

export type Claim =
  | { readonly kind: "ready"; readonly launch: LaunchContext }
  | { readonly kind: "lost"; readonly launch: LaunchContext }
  | { readonly kind: "settled" }
  | { readonly kind: "gone" };

/** `stopped` : le lancement n'est plus `running` (annulé, repris) ; rien n'a été publié. */
export type PublishOutcome = "published" | "stopped";

export interface LaunchTimes {
  readonly lastSeenAt: Date | null;
  readonly startedAt: Date | null;
}

/**
 * Accès base du job `agent-propose`. Le lancement n'est connu que par son identifiant : l'organisation se lit d'abord
 * par le client brut (seule lecture hors contexte), tout le reste passe par le client multi-tenant sous
 * `withOrganization`. Chaque méthode est une requête courte : aucune transaction ne reste ouverte pendant un appel
 * au modèle. Le magasin n'écrit que `agent_launches`, `agent_proposals` et `notifications`.
 */
export class AgentProposeStore {
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

  async claim(launchId: string): Promise<Claim> {
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
      if (row.status === "running") return { kind: "lost", launch };
      if (row.status !== "queued") return { kind: "settled" };
      const now = this.clock();
      const { count } = await this.client.agentLaunch.updateMany({
        where: { id: launchId, status: "queued" },
        data: { status: "running", startedAt: now, heartbeatAt: now },
      });
      return count === 0 ? { kind: "settled" } : { kind: "ready", launch };
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

  /**
   * Publie une zone en UNE transaction : propositions `pending` à la suite des positions déjà publiées, compteurs et
   * battement du lancement. La relecture peut donc commencer avant la fin de la génération.
   */
  publishZone(
    launch: LaunchContext,
    zone: string,
    candidates: readonly Candidate[],
    discarded: number,
  ): Promise<PublishOutcome> {
    return this.inOrganization(launch, () =>
      this.client.$transaction(async (tx) => {
        const current = await tx.agentLaunch.findFirst({
          where: { id: launch.id, status: "running" },
          select: { proposedCount: true },
        });
        if (!current) return "stopped";
        const { rows, overflow } = rowsOf(launch, zone, candidates, current.proposedCount);
        if (rows.length > 0) {
          await tx.agentProposal.createMany({
            data: rows.map((row) => ({ ...row, payload: row.payload as Prisma.InputJsonObject })),
          });
        }
        await tx.agentLaunch.updateMany({
          where: { id: launch.id },
          data: {
            proposedCount: { increment: rows.length },
            discardedCount: { increment: discarded + overflow },
            heartbeatAt: this.clock(),
          },
        });
        return "published";
      }),
    );
  }

  finish(launch: LaunchContext): Promise<void> {
    return this.settle(launch, { status: "done" });
  }

  fail(launch: LaunchContext, errorCode: string): Promise<void> {
    return this.settle(launch, { status: "failed", errorCode });
  }

  private settle(
    launch: LaunchContext,
    outcome: { status: "done" } | { status: "failed"; errorCode: string },
  ): Promise<void> {
    return this.inOrganization(launch, async () => {
      await this.client.agentLaunch.updateMany({
        where: { id: launch.id, status: { in: ["queued", "running"] } },
        data: { ...outcome, finishedAt: this.clock() },
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
