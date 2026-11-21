import { randomUUID } from "node:crypto";
import type { PublishedProposal } from "../../src/agent-propose/coverage.ts";
import { rowsOf } from "../../src/agent-propose/publish.ts";
import type { LaunchSources } from "../../src/agent-propose/sources.ts";
import type {
  Claim,
  CoverageCounts,
  CoveragePublication,
  LaunchContext,
  LaunchTimes,
  ProposeStore,
  PublishOutcome,
  ZonePublication,
} from "../../src/agent-propose/store.ts";
import { mergeLinks } from "../../src/agent-propose/store-report.ts";

/** État d'un lancement tenu en mémoire : les colonnes du bilan (TK-114b) et les compteurs historiques. */
export interface MemoryLaunch {
  status: string;
  errorCode: string | null;
  stopReason: string | null;
  segment: number;
  handoffAt: Date | null;
  zones: string[];
  zonesDone: number;
  zonesDiscarded: number;
  discardReasons: Record<string, number>;
  coverageCalls: number;
  coverageStalled: number;
  coverageBefore: CoverageCounts | null;
  coverageAfter: CoverageCounts | null;
  proposedCount: number;
  discardedCount: number;
}

/**
 * Faux magasin de `agent-propose` (TK-114b) : mêmes règles que `AgentProposeStore` sur un lancement en mémoire (prise par
 * segment, publication refusée hors `running`, compléments seulement sur une proposition `pending` non appliquée).
 */
export class MemoryProposeStore implements ProposeStore {
  readonly launch: LaunchContext;
  readonly state: MemoryLaunch;
  readonly proposals: (Omit<PublishedProposal, "payload"> & {
    payload: Record<string, unknown>;
    position: number;
  })[] = [];
  readonly handoffs: number[] = [];
  private readonly data: LaunchSources;

  constructor(launch: LaunchContext, sources: LaunchSources) {
    this.launch = launch;
    this.data = sources;
    this.state = {
      status: "queued",
      errorCode: null,
      stopReason: null,
      segment: 0,
      handoffAt: null,
      zones: [],
      zonesDone: 0,
      zonesDiscarded: 0,
      discardReasons: {},
      coverageCalls: 0,
      coverageStalled: 0,
      coverageBefore: null,
      coverageAfter: null,
      proposedCount: 0,
      discardedCount: 0,
    };
  }

  private progress() {
    const { segment, zones, zonesDone, zonesDiscarded, coverageCalls, coverageStalled } =
      this.state;
    return { segment, zones, zonesDone, zonesDiscarded, coverageCalls, coverageStalled };
  }

  async claim(launchId: string, segment?: number): Promise<Claim> {
    if (launchId !== this.launch.id) return { kind: "gone" };
    const state = this.state;
    if (segment === undefined) {
      if (state.status === "running") return { kind: "lost", launch: this.launch };
      if (state.status !== "queued") return { kind: "settled" };
      state.status = "running";
      return { kind: "ready", launch: this.launch, progress: this.progress() };
    }
    if (state.status !== "running" || state.segment !== segment) return { kind: "settled" };
    if (state.handoffAt === null) return { kind: "lost", launch: this.launch };
    state.handoffAt = null;
    return { kind: "ready", launch: this.launch, progress: this.progress() };
  }

  async sources(): Promise<LaunchSources | null> {
    return this.data;
  }

  async euOnly(): Promise<boolean> {
    return false;
  }

  async heartbeat(): Promise<void> {}

  async recordZones(
    _launch: LaunchContext,
    zones: readonly string[],
    before?: CoverageCounts,
  ): Promise<PublishOutcome> {
    if (this.state.status !== "running") return "stopped";
    this.state.zones = [...zones];
    if (before !== undefined) this.state.coverageBefore = before;
    return "published";
  }

  private append(rows: ReturnType<typeof rowsOf>["rows"]): void {
    for (const row of rows) {
      this.proposals.push({
        id: randomUUID(),
        kind: row.kind,
        zone: row.zone,
        title: row.title,
        status: "pending",
        applied: false,
        payload: row.payload,
        position: row.position,
      });
    }
    this.state.proposedCount += rows.length;
  }

  async publishZone(launch: LaunchContext, publication: ZonePublication): Promise<PublishOutcome> {
    if (this.state.status !== "running") return "stopped";
    const { rows, overflow } = rowsOf(
      launch,
      publication.zone,
      publication.accepted,
      this.state.proposedCount,
    );
    this.append(rows);
    this.state.discardedCount += publication.discarded + overflow;
    const reason = publication.reason;
    if (reason === undefined) this.state.zonesDone += 1;
    else {
      this.state.zonesDiscarded += 1;
      this.state.discardReasons[reason] = (this.state.discardReasons[reason] ?? 0) + 1;
    }
    return "published";
  }

  async publishCoverage(
    launch: LaunchContext,
    publication: CoveragePublication,
  ): Promise<PublishOutcome> {
    if (this.state.status !== "running") return "stopped";
    const { rows, overflow } = rowsOf(
      launch,
      "Flux techniques",
      publication.accepted,
      this.state.proposedCount,
    );
    for (const complement of publication.complements) {
      const target = this.proposals.find((p) => p.id === complement.id);
      if (target === undefined || target.status !== "pending" || target.applied) continue;
      target.payload = mergeLinks(target.payload, complement);
    }
    this.append(rows);
    this.state.discardedCount += publication.discarded + overflow;
    if (publication.call) this.state.coverageCalls += 1;
    return "published";
  }

  async recordCoverage(
    _launch: LaunchContext,
    after: CoverageCounts,
    stalled?: number,
  ): Promise<void> {
    this.state.coverageAfter = after;
    if (stalled !== undefined) this.state.coverageStalled = stalled;
  }

  async launchProposals(): Promise<PublishedProposal[]> {
    return this.proposals.map((proposal) => ({ ...proposal }));
  }

  async handoff(_launch: LaunchContext, segment: number): Promise<boolean> {
    if (this.state.status !== "running" || this.state.segment !== segment) return false;
    this.state.segment = segment + 1;
    this.state.handoffAt = new Date();
    this.handoffs.push(segment);
    return true;
  }

  async finish(_launch: LaunchContext, reason: string): Promise<void> {
    if (this.state.status !== "running") return;
    this.state.status = "done";
    this.state.stopReason = reason;
  }

  async fail(_launch: LaunchContext, errorCode: string, reason?: string): Promise<void> {
    if (this.state.status !== "running" && this.state.status !== "queued") return;
    this.state.status = "failed";
    this.state.errorCode = errorCode;
    this.state.stopReason = reason ?? null;
  }

  async cancelled(): Promise<void> {
    if (this.state.status === "canceled") this.state.stopReason = "cancelled";
  }

  async times(): Promise<LaunchTimes> {
    return { lastSeenAt: new Date(), startedAt: new Date() };
  }

  async notifyReady(): Promise<void> {}
}
