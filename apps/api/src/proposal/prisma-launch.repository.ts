import { AGENT_LAUNCH_STALE_MS, type AgentLaunchStatus } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { isUniqueViolation } from "../tracker/api-errors.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  LaunchOutcome,
  LaunchRecord,
  LaunchRepository,
  NewLaunch,
  OptionFacts,
  SecurityFacts,
  TechnicalFacts,
} from "./launch.repository.ts";
import { readSecurityFacts } from "./security-facts.query.ts";

const ACTIVE: AgentLaunchStatus[] = ["queued", "running"];

interface Row {
  id: string;
  deliverable: string;
  mode: string;
  status: string;
  errorCode: string | null;
  proposedCount: number;
  discardedCount: number;
  baseVersion: number | null;
  requestedBy: string;
  lastSeenAt: Date | null;
  finishedAt: Date | null;
  zones: unknown;
  zonesDone: number;
  zonesDiscarded: number;
  discardReasons: unknown;
  coverageCalls: number;
  coverageBefore: unknown;
  coverageAfter: unknown;
  stopReason: string | null;
}

export const launchOf = (row: Row): LaunchRecord => ({
  id: row.id,
  deliverable: row.deliverable,
  mode: row.mode,
  status: row.status as AgentLaunchStatus,
  errorCode: row.errorCode,
  proposedCount: row.proposedCount,
  discardedCount: row.discardedCount,
  baseVersion: row.baseVersion,
  requestedBy: row.requestedBy,
  lastSeenAt: row.lastSeenAt,
  finishedAt: row.finishedAt,
  progress: {
    zones: row.zones,
    zonesDone: row.zonesDone,
    zonesDiscarded: row.zonesDiscarded,
    discardReasons: row.discardReasons,
    coverageCalls: row.coverageCalls,
    coverageBefore: row.coverageBefore,
    coverageAfter: row.coverageAfter,
    stopReason: row.stopReason,
  },
});

@Injectable()
export class PrismaLaunchRepository implements LaunchRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
  ) {}

  frozenVersion(scope: ProjectScope): Promise<number | null> {
    return this.transactions.run(
      scope,
      async (tx) => (await this.latestFrozen(tx, scope))?.number ?? null,
    );
  }

  async create(scope: ProjectScope, launch: NewLaunch, now: Date): Promise<LaunchOutcome> {
    try {
      return await this.transactions.run(scope, async (tx) => {
        await this.reclaimStale(tx, scope, launch.deliverable, now);
        const row = await tx.agentLaunch.create({
          data: {
            organizationId: scope.organizationId,
            projectId: scope.projectId,
            deliverable: launch.deliverable,
            mode: launch.mode,
            instruction: launch.instruction,
            status: "queued",
            requestedBy: scope.userId,
            sources: [...launch.sources],
            baseVersion: launch.baseVersion,
            heartbeatAt: now,
          },
        });
        return { kind: "created", launch: launchOf(row) };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // L'unicité a tranché : on rend le lancement qui tient le verrou.
      const active = await this.transactions.run(scope, (tx) =>
        tx.agentLaunch.findFirst({
          where: {
            projectId: scope.projectId,
            deliverable: launch.deliverable,
            status: { in: ACTIVE },
          },
          select: { id: true },
        }),
      );
      if (!active) throw error;
      return { kind: "busy", launchId: active.id };
    }
  }

  discard(scope: ProjectScope, launchId: string): Promise<void> {
    return this.transactions.run(scope, async (tx) => {
      await tx.agentLaunch.deleteMany({
        where: { id: launchId, projectId: scope.projectId, status: "queued" },
      });
    });
  }

  fail(scope: ProjectScope, launchId: string, errorCode: string, now: Date): Promise<void> {
    return this.transactions.run(scope, async (tx) => {
      await tx.agentLaunch.updateMany({
        where: { id: launchId, projectId: scope.projectId, status: { in: ACTIVE } },
        data: { status: "failed", errorCode, finishedAt: now },
      });
    });
  }

  optionFacts(scope: ProjectScope): Promise<OptionFacts> {
    return this.transactions.run(scope, async (tx) => ({
      withoutCriteria: await this.countWithoutCriteria(tx, scope),
    }));
  }

  technicalFacts(scope: ProjectScope): Promise<TechnicalFacts> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, {});
      if (!found || found.snapshot.status === "failed") {
        return { components: 0, openChoices: 0, requirements: 0 };
      }
      const snapshotId = found.snapshot.id;
      const count = (kind: string) => tx.specEntity.count({ where: { snapshotId, kind } });
      const openChoices = await tx.specEntity.count({
        where: { snapshotId, kind: "stack", data: { path: ["statut"], equals: "a_trancher" } },
      });
      return {
        components: await count("component"),
        openChoices,
        requirements: await count("nfr"),
      };
    });
  }

  securityFacts(scope: ProjectScope): Promise<SecurityFacts> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, {});
      if (!found || found.snapshot.status === "failed") {
        return { surfaces: 0, unclassified: 0, unanswered: 0 };
      }
      return readSecurityFacts(tx, found.snapshot.id);
    });
  }

  hasFunctionalEntities(scope: ProjectScope): Promise<boolean> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, {});
      if (!found || found.snapshot.status === "failed") return false;
      const snapshotId = found.snapshot.id;
      if ((await tx.specFeature.count({ where: { snapshotId } })) > 0) return true;
      return (
        (await tx.specEntity.count({
          where: { snapshotId, kind: { in: ["rule", "roles", "flow"] } },
        })) > 0
      );
    });
  }

  forList(
    scope: ProjectScope,
    deliverable: string | undefined,
    launchId: string | undefined,
  ): Promise<LaunchRecord | null> {
    return this.transactions.run(scope, async (tx) => {
      const row = await tx.agentLaunch.findFirst({
        where: {
          projectId: scope.projectId,
          ...(deliverable === undefined ? {} : { deliverable }),
          ...(launchId === undefined ? {} : { id: launchId }),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      return row ? launchOf(row) : null;
    });
  }

  touchSeen(scope: ProjectScope, launchId: string, now: Date, throttleMs: number): Promise<void> {
    return this.transactions.run(scope, async (tx) => {
      await tx.agentLaunch.updateMany({
        where: {
          id: launchId,
          projectId: scope.projectId,
          OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now.getTime() - throttleMs) } }],
        },
        data: { lastSeenAt: now },
      });
    });
  }

  private latestFrozen(tx: Tx, scope: ProjectScope) {
    return tx.ideaVersion.findFirst({
      where: { projectId: scope.projectId, commitSha: { not: null } },
      orderBy: { number: "desc" },
      select: { number: true, pagesVersions: true },
    });
  }

  private async reclaimStale(tx: Tx, scope: ProjectScope, deliverable: string, now: Date) {
    await tx.agentLaunch.updateMany({
      where: {
        projectId: scope.projectId,
        deliverable,
        status: "running",
        heartbeatAt: { lt: new Date(now.getTime() - AGENT_LAUNCH_STALE_MS) },
      },
      data: { status: "failed", errorCode: "worker_lost", finishedAt: now },
    });
  }

  private async countWithoutCriteria(tx: Tx, scope: ProjectScope): Promise<number> {
    const found = await this.resolver.resolve(tx, scope, {});
    if (!found || found.snapshot.status === "failed") return 0;
    return tx.specFeature.count({
      where: { snapshotId: found.snapshot.id, criteria: { none: {} } },
    });
  }
}
