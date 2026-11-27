import { Module } from "@nestjs/common";
import { ProposalModule } from "../proposal/proposal.module.ts";
import { SpecBatchModule } from "../spec-batch/spec-batch.module.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaSpecSecurityRepository } from "./prisma-spec-security.repository.ts";
import { SpecSecurityController } from "./spec-security.controller.ts";
import { SPEC_SECURITY_REPOSITORY } from "./spec-security.repository.ts";
import { SpecSecurityService } from "./spec-security.service.ts";
import { SpecSecurityWritesController } from "./spec-security-writes.controller.ts";
import { SpecSecurityWritesService } from "./spec-security-writes.service.ts";

/**
 * Page Sécurité (TK-117) : lectures de l'index, écritures par lots et propositions ; « Valider » est servi par le module
 * des validations (`review/security-validate.controller.ts`).
 */
@Module({
  imports: [TrackerModule, SpecReadModule, SpecBatchModule, ProposalModule],
  controllers: [SpecSecurityController, SpecSecurityWritesController],
  providers: [
    SpecSecurityService,
    SpecSecurityWritesService,
    { provide: SPEC_SECURITY_REPOSITORY, useClass: PrismaSpecSecurityRepository },
  ],
  exports: [SpecSecurityService],
})
export class SpecSecurityModule {}
