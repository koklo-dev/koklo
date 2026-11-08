import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { IDEA_READ_ROLES, IDEA_WRITE_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { requestIdOf } from "../request-context.ts";
import { inProject } from "../tracker/scope.ts";
import { IdeaAgentService } from "./idea-agent.service.ts";
import { IdeaProposalService } from "./idea-proposal.service.ts";

/**
 * Agent de l'espace Idée (TK-90). Même ordre qu'`IdeaController` : garde de rôle (403), projet atteignable (404
 * uniforme), puis la ressource. Lecture (état, fil) : six rôles ; dialogue, manques et décisions : `IDEA_WRITE_ROLES`
 * (le client décide comme l'équipe, le business lit seulement). Droits vérifiés côté serveur, jamais par l'écran.
 */
@Controller()
export class IdeaAgentController {
  constructor(
    @Inject(IdeaAgentService) private readonly agent: IdeaAgentService,
    @Inject(IdeaProposalService) private readonly proposals: IdeaProposalService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_READ_ROLES)
  @Implement(contract.idea.agent.status)
  status(@Req() request: Request) {
    return implement(contract.idea.agent.status).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.agent.status(scope, requireSession(request).role),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_READ_ROLES)
  @Implement(contract.idea.message.list)
  messages(@Req() request: Request) {
    return implement(contract.idea.message.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.agent.messages(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_WRITE_ROLES)
  @Implement(contract.idea.proposal.decide)
  decide(@Req() request: Request) {
    return implement(contract.idea.proposal.decide).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.proposals.decide(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_WRITE_ROLES)
  @Implement(contract.idea.proposal.undo)
  undo(@Req() request: Request) {
    return implement(contract.idea.proposal.undo).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.proposals.undo(scope, input.proposalId),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_WRITE_ROLES)
  @Implement(contract.ai.ideaChat)
  chat(@Req() request: Request) {
    return implement(contract.ai.ideaChat).handler(({ input, errors, signal }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) =>
          this.agent.chat(scope, requireSession(request).role, input, requestIdOf(request), signal),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_WRITE_ROLES)
  @Implement(contract.ai.ideaGaps)
  gaps(@Req() request: Request) {
    return implement(contract.ai.ideaGaps).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.agent.gaps(scope, requestIdOf(request)),
        this.access,
      ),
    );
  }
}
