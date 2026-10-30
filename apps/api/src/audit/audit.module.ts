import { Module } from "@nestjs/common";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { AuditController } from "./audit.controller.ts";
import { AUDIT_REPOSITORY } from "./audit.repository.ts";
import { AuditService } from "./audit.service.ts";
import { PrismaAuditRepository } from "./prisma-audit.repository.ts";

@Module({
  imports: [TrackerModule],
  controllers: [AuditController],
  providers: [AuditService, { provide: AUDIT_REPOSITORY, useClass: PrismaAuditRepository }],
})
export class AuditModule {}
