import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.ts";
import { AgentProposeQueue } from "../queue/agent-propose-queue.ts";
import { SpecDeliverablesModule } from "../spec-deliverables/spec-deliverables.module.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { LAUNCH_REPOSITORY } from "./launch.repository.ts";
import { PrismaLaunchRepository } from "./prisma-launch.repository.ts";
import { PrismaProposalRepository } from "./prisma-proposal.repository.ts";
import { ProposalController } from "./proposal.controller.ts";
import { PROPOSAL_REPOSITORY } from "./proposal.repository.ts";
import { ProposalService } from "./proposal.service.ts";
import { ProposalLaunchService } from "./proposal-launch.service.ts";
import { ProposalReviseService } from "./proposal-revise.service.ts";

/**
 * Propositions de l'agent (TK-99a) : lancement (verrou en base, quota et audit, enfilage), relecture groupée,
 * décisions, révision d'une proposition. Les trois routes `ai.*` vivent ici et non dans `AiModule` : le lancement a
 * besoin du dépôt de lancements, et `AiModule` ne doit pas dépendre d'un module qui dépend de lui.
 */
@Module({
  imports: [TrackerModule, AiModule, SpecReadModule, SpecDeliverablesModule],
  controllers: [ProposalController],
  providers: [
    ProposalService,
    ProposalLaunchService,
    ProposalReviseService,
    AgentProposeQueue,
    { provide: LAUNCH_REPOSITORY, useClass: PrismaLaunchRepository },
    { provide: PROPOSAL_REPOSITORY, useClass: PrismaProposalRepository },
  ],
})
export class ProposalModule {}
