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
import { IdeaFramingController } from "./idea-framing.controller.ts";
import { IDEA_FREEZE_REPOSITORY } from "./idea-freeze.repository.ts";
import { IdeaFreezeService } from "./idea-freeze.service.ts";
import { IDEA_PROPOSAL_REPOSITORY } from "./idea-proposal.repository.ts";
import { IdeaProposalService } from "./idea-proposal.service.ts";
import { IDEA_SYNTHESIS_REPOSITORY } from "./idea-synthesis.repository.ts";
import { IdeaSynthesisService } from "./idea-synthesis.service.ts";
import { PrismaIdeaRepository } from "./prisma-idea.repository.ts";
import { PrismaIdeaAgentRepository } from "./prisma-idea-agent.repository.ts";
import { PrismaIdeaFreezeRepository } from "./prisma-idea-freeze.repository.ts";
import { PrismaIdeaProposalRepository } from "./prisma-idea-proposal.repository.ts";
import { PrismaIdeaSynthesisRepository } from "./prisma-idea-synthesis.repository.ts";

@Module({
  imports: [TrackerModule, SpecBatchModule, AiModule],
  controllers: [IdeaController, IdeaAgentController, IdeaFramingController],
  providers: [
    IdeaService,
    IdeaAgentService,
    IdeaProposalService,
    IdeaFreezeService,
    IdeaSynthesisService,
    { provide: IDEA_REPOSITORY, useClass: PrismaIdeaRepository },
    { provide: IDEA_AGENT_REPOSITORY, useClass: PrismaIdeaAgentRepository },
    { provide: IDEA_PROPOSAL_REPOSITORY, useClass: PrismaIdeaProposalRepository },
    { provide: IDEA_FREEZE_REPOSITORY, useClass: PrismaIdeaFreezeRepository },
    { provide: IDEA_SYNTHESIS_REPOSITORY, useClass: PrismaIdeaSynthesisRepository },
  ],
})
export class IdeaModule {}
