import type {
  ProposalDecideInput,
  ProposalDecideManyInput,
  ProposalListInput,
  ProposalListOutput,
} from "@koklo/contract";
import { LAST_SEEN_THROTTLE_MS } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { CLOCK, type Clock } from "../clock.ts";
import { conflict, notFound, orNotFound, validation } from "../tracker/api-errors.ts";
import { DEFAULT_PAGE_SIZE } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { LAUNCH_REPOSITORY, type LaunchRepository } from "./launch.repository.ts";
import { PROPOSAL_REPOSITORY, type ProposalRepository } from "./proposal.repository.ts";
import { validContent } from "./proposal-content.ts";
import {
  ALL_GROUP_KEY,
  buildGroups,
  GROUPING_THRESHOLD,
  type GroupFilter,
  groupFilterOf,
} from "./proposal-groups.ts";
import { launchView, proposalView } from "./proposal-views.ts";

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
  ) {}

  async list(scope: ProjectScope, input: ProposalListInput): Promise<ProposalListOutput> {
    const launch = await this.launches.forList(scope, input.deliverable, input.launchId);
    if (launch === null) return EMPTY_PAGE;
    await this.launches.touchSeen(
      scope,
      launch.id,
      new Date(this.clock.now()),
      LAST_SEEN_THROTTLE_MS,
    );
    const group = input.group === undefined ? {} : filterOf(input.group);
    const groups = buildGroups(await this.proposals.groupCounts(scope, launch.id), input.groupBy);
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

  async decide(scope: ProjectScope, input: ProposalDecideInput) {
    const current = orNotFound(await this.proposals.find(scope, input.proposalId));
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
    return proposalView(outcome.proposal);
  }

  async decideMany(scope: ProjectScope, input: ProposalDecideManyInput) {
    const group = filterOf(input.group);
    const launch = orNotFound(await this.launches.forList(scope, undefined, input.launchId));
    if (input.group === ALL_GROUP_KEY) await this.assertSingleGroup(scope, launch.id);
    const outcome = await this.proposals.decideMany(scope, launch.id, group, input.expectedPending);
    if (outcome.kind === "changed") {
      throw new ORPCError("PROPOSAL_COUNT_CHANGED", {
        data: { expected: input.expectedPending, actual: outcome.actual },
      });
    }
    return { decided: outcome.decided };
  }

  /** « all » n'est un groupe que sous le seuil : au-delà, accepter tout d'un coup n'est jamais un geste de groupe. */
  private async assertSingleGroup(scope: ProjectScope, launchId: string): Promise<void> {
    const counts = await this.proposals.groupCounts(scope, launchId);
    if (counts.reduce((sum, row) => sum + row.n, 0) > GROUPING_THRESHOLD) {
      throw validation("group", "Ce lancement est groupé : choisissez un groupe.");
    }
  }
}
