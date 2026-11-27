import type {
  ProposalDecideInput,
  ProposalDecideManyInput,
  ProposalListInput,
  ProposalListOutput,
} from "@koklo/contract";
import { type AgentLaunchStatus, LAST_SEEN_THROTTLE_MS } from "@koklo/domain";
import { specPathIndex } from "@koklo/schema";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { CLOCK, type Clock } from "../clock.ts";
import { requestLogger } from "../request-logger.ts";
import { SpecArchitectureService } from "../spec-architecture/spec-architecture.service.ts";
import { conflict, notFound, orNotFound, validation } from "../tracker/api-errors.ts";
import { DEFAULT_PAGE_SIZE } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  LAUNCH_REPOSITORY,
  type LaunchRecord,
  type LaunchRepository,
} from "./launch.repository.ts";
import { PROPOSAL_REPOSITORY, type ProposalRepository } from "./proposal.repository.ts";
import { assertDeliverableRole } from "./proposal-access.ts";
import { validContent } from "./proposal-content.ts";
import {
  ALL_GROUP_KEY,
  buildGroups,
  GROUPING_THRESHOLD,
  type GroupFilter,
  groupFilterOf,
} from "./proposal-groups.ts";
import { alreadyPresentIds, PRESENT_KINDS, presentTargetOf } from "./proposal-present.ts";
import { launchView, proposalView } from "./proposal-views.ts";

/** Lancements dont les propositions ne bougent plus : seuls réglés « déjà présentes » (TK-114g, B699). */
const FINISHED: ReadonlySet<AgentLaunchStatus> = new Set(["done", "failed", "canceled"]);

/** Lecture de la tête impossible : rien n'est réglé, la liste répond comme avant (B699) ; ni message ni secret. */
function logUnsettled(error: unknown): void {
  requestLogger().warn(
    {
      errorName: error instanceof Error ? error.name : "erreur",
      ...(error instanceof ORPCError ? { code: error.code } : {}),
    },
    "proposal already-present settle skipped",
  );
}

const EMPTY_PAGE: ProposalListOutput = {
  items: [],
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: 0,
  groups: [],
  launch: null,
};

const filterOf = (group: string): GroupFilter => {
  const filter = groupFilterOf(group);
  if (filter === null) throw validation("group", "Groupe inconnu.");
  return filter;
};

/**
 * Relecture et décision des propositions de l'agent. Décider ne modifie jamais la spec : `specBatch.submit` seul
 * écrit, et exige que chaque proposition soit `accepted`. Le contenu corrigé est revalidé par le schéma du type.
 */
@Injectable()
export class ProposalService {
  constructor(
    @Inject(PROPOSAL_REPOSITORY) private readonly proposals: ProposalRepository,
    @Inject(LAUNCH_REPOSITORY) private readonly launches: LaunchRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SpecArchitectureService) private readonly architecture: SpecArchitectureService,
  ) {}

  async list(
    scope: ProjectScope,
    role: string | undefined,
    input: ProposalListInput,
  ): Promise<ProposalListOutput> {
    assertDeliverableRole(input.deliverable, role);
    const launch = await this.launches.forList(scope, input.deliverable, input.launchId);
    if (launch === null) return EMPTY_PAGE;
    await this.launches.touchSeen(
      scope,
      launch.id,
      new Date(this.clock.now()),
      LAST_SEEN_THROTTLE_MS,
    );
    await this.settleAlreadyPresent(scope, launch);
    const group = input.group === undefined ? {} : filterOf(input.group);
    const groups = buildGroups(
      await this.proposals.groupCounts(scope, launch.id),
      input.groupBy,
      launch.deliverable,
    );
    const window = await this.proposals.window(scope, {
      launchId: launch.id,
      pendingOnly: input.status === "pending",
      group,
      limit: input.limit ?? DEFAULT_PAGE_SIZE,
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    });
    return {
      items: window.rows.map(proposalView),
      nextCursor: window.nextCursor,
      previousCursor: window.previousCursor,
      offset: window.offset,
      total: window.total,
      groups,
      launch: launchView(launch),
    };
  }

  async decide(scope: ProjectScope, role: string | undefined, input: ProposalDecideInput) {
    const current = orNotFound(await this.proposals.find(scope, input.proposalId));
    assertDeliverableRole(current.deliverable, role);
    if (current.discardReason !== null) throw conflict("proposal_already_present");
    if (input.edited !== undefined && input.decision !== "accept") {
      throw validation("edited", "Un contenu corrigé ne s'enregistre qu'avec l'acceptation.");
    }
    const edited =
      input.edited === undefined
        ? undefined
        : validContent(current.kind, input.edited, "edited", current.title);
    const outcome = await this.proposals.decide(scope, current.id, input.decision, edited);
    if (outcome.kind === "missing") throw notFound();
    if (outcome.kind === "applied") throw conflict("proposal_applied");
    if (outcome.kind === "present") throw conflict("proposal_already_present");
    return proposalView(outcome.proposal);
  }

  async decideMany(scope: ProjectScope, role: string | undefined, input: ProposalDecideManyInput) {
    const group = filterOf(input.group);
    const launch = orNotFound(await this.launches.forList(scope, undefined, input.launchId));
    assertDeliverableRole(launch.deliverable, role);
    if (input.group === ALL_GROUP_KEY) await this.assertSingleGroup(scope, launch.id);
    const outcome = await this.proposals.decideMany(scope, launch.id, group, input.expectedPending);
    if (outcome.kind === "changed") {
      throw new ORPCError("PROPOSAL_COUNT_CHANGED", {
        data: { expected: input.expectedPending, actual: outcome.actual },
      });
    }
    return { decided: outcome.decided };
  }

  /**
   * TK-114g (B699) : créations d'un lancement terminé déjà présentes dans l'arbre au commit indexé → `rejected`,
   * `already_present`. Aucune candidate : aucune lecture git ; lecture impossible : rien n'est réglé.
   */
  private async settleAlreadyPresent(scope: ProjectScope, launch: LaunchRecord): Promise<void> {
    if (!FINISHED.has(launch.status)) return;
    const candidates = (
      await this.proposals.unsettledCreations(scope, launch.id, PRESENT_KINDS)
    ).filter((record) => presentTargetOf(record) !== null);
    if (candidates.length === 0) return;
    let paths: string[] | null;
    try {
      paths = await this.architecture.headSpecPaths(scope);
    } catch (error) {
      logUnsettled(error);
      return;
    }
    const ids = paths === null ? [] : alreadyPresentIds(candidates, specPathIndex(paths));
    if (ids.length > 0) await this.proposals.settleAlreadyPresent(scope, launch.id, ids);
  }

  /** « all » n'est un groupe que sous le seuil : au-delà, accepter tout d'un coup n'est jamais un geste de groupe. */
  private async assertSingleGroup(scope: ProjectScope, launchId: string): Promise<void> {
    const counts = await this.proposals.groupCounts(scope, launchId);
    if (counts.reduce((sum, row) => sum + row.n, 0) > GROUPING_THRESHOLD) {
      throw validation("group", "Ce lancement est groupé : choisissez un groupe.");
    }
  }
}
