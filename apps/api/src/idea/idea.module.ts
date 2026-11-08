import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.ts";
import { SpecBatchModule } from "../spec-batch/spec-batch.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { IdeaController } from "./idea.controller.ts";
import { IDEA_REPOSITORY } from "./idea.repository.ts";
import { IdeaService } from "./idea.service.ts";
import { IdeaAgentController } from "./idea-agent.controller.ts";
import { IDEA_AGENT_REPOSITORY } from "./idea-agent.repository.ts";
import { IdeaAgentService } from "./idea-agent.service.ts";
import { IDEA_PROPOSAL_REPOSITORY } from "./idea-proposal.repository.ts";
import { IdeaProposalService } from "./idea-proposal.service.ts";
import { PrismaIdeaRepository } from "./prisma-idea.repository.ts";
import { PrismaIdeaAgentRepository } from "./prisma-idea-agent.repository.ts";
import { PrismaIdeaProposalRepository } from "./prisma-idea-proposal.repository.ts";

@Module({
  imports: [TrackerModule, SpecBatchModule, AiModule],
  controllers: [IdeaController, IdeaAgentController],
  providers: [
    IdeaService,
    IdeaAgentService,
    IdeaProposalService,
    { provide: IDEA_REPOSITORY, useClass: PrismaIdeaRepository },
    { provide: IDEA_AGENT_REPOSITORY, useClass: PrismaIdeaAgentRepository },
    { provide: IDEA_PROPOSAL_REPOSITORY, useClass: PrismaIdeaProposalRepository },
  ],
})
export class IdeaModule {}
