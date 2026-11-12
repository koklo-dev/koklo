import type {
  clientSpaceFlowsOutputSchema,
  clientSpaceProgressOutputSchema,
  clientSpaceRolesOutputSchema,
  clientSpaceRulesOutputSchema,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";
import { canReview } from "../review/review-policy.ts";
import { DEFAULT_PAGE_SIZE } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  CLIENT_SPACE_REPOSITORY,
  type ClientSpaceRepository,
  type EntityListRequest,
} from "./client-space.repository.ts";
import { clientFlowOf, clientRolesOf, clientRuleOf } from "./client-space-entities.ts";
import { progressOf } from "./client-space-progress.ts";
import { validationOf } from "./validation.ts";

type Progress = z.output<typeof clientSpaceProgressOutputSchema>;
type Flows = z.output<typeof clientSpaceFlowsOutputSchema>;
type Rules = z.output<typeof clientSpaceRulesOutputSchema>;
type Roles = z.output<typeof clientSpaceRolesOutputSchema>;

/** Même masque que les fonctionnalités : index absent ou en échec, aucun détail. */
const notReady = () => new ORPCError("SPACE_NOT_READY");

interface ListInput {
  limit?: number | undefined;
  cursor?: string | undefined;
  q?: string | undefined;
  type?: string | undefined;
}

const requestOf = (input: ListInput): EntityListRequest => ({
  limit: input.limit ?? DEFAULT_PAGE_SIZE,
  cursor: input.cursor,
  q: input.q,
  type: input.type,
});

/**
 * Progression, parcours, règles et rôles du point de vue du client (TK-104, B347). Aucune écriture. Le droit de valider
 * (`canValidate`) vient de la politique `canReview` d'après le lien client du projet, jamais de l'entrée.
 */
@Injectable()
export class ClientSpaceEntitiesService {
  constructor(
    @Inject(CLIENT_SPACE_REPOSITORY) private readonly repository: ClientSpaceRepository,
  ) {}

  async progress(scope: ProjectScope, role: string | undefined): Promise<Progress> {
    const read = await this.repository.progress(scope);
    if (read === null) throw notReady();
    const progress = progressOf(read.facts, read.counts);
    return {
      hasClient: read.hasClient,
      canValidate: canReview(role, "deliverable", "functional", read.hasClient),
      clientFirstName: read.clientFirstName,
      validation: progress.validation,
      tabs: progress.tabs,
      untreated: progress.untreated,
      toRevise: progress.toRevise,
      changed: progress.changed,
      next: progress.next,
      version: read.facts.headSha,
    };
  }

  async flows(scope: ProjectScope, input: ListInput): Promise<Flows> {
    const read = await this.repository.flows(scope, requestOf(input));
    if (read === null) throw notReady();
    const { window, headSha, verdicts } = read;
    return {
      items: window.rows.map((row) =>
        clientFlowOf(row, validationOf(verdicts.get(row.specId), headSha)),
      ),
      ...pageOf(window),
      version: headSha,
    };
  }

  async rules(scope: ProjectScope, input: ListInput): Promise<Rules> {
    const read = await this.repository.rules(scope, requestOf(input));
    if (read === null) throw notReady();
    return {
      items: read.window.rows.map(clientRuleOf),
      ...pageOf(read.window),
      ...validationOf(read.block, read.headSha),
      version: read.headSha,
    };
  }

  async roles(scope: ProjectScope): Promise<Roles> {
    const read = await this.repository.roles(scope);
    if (read === null) throw notReady();
    return {
      ...clientRolesOf(read.file),
      ...validationOf(read.block, read.headSha),
      version: read.headSha,
    };
  }
}

const pageOf = (window: {
  nextCursor: string | null;
  previousCursor: string | null;
  offset: number;
  total: number;
}) => ({
  nextCursor: window.nextCursor,
  previousCursor: window.previousCursor,
  offset: window.offset,
  total: window.total,
});
