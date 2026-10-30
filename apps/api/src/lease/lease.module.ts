import { Module } from "@nestjs/common";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { LeaseController } from "./lease.controller.ts";
import { LEASE_REPOSITORY } from "./lease.repository.ts";
import { LeaseService } from "./lease.service.ts";
import { PrismaLeaseRepository } from "./prisma-lease.repository.ts";

@Module({
  imports: [TrackerModule],
  controllers: [LeaseController],
  providers: [LeaseService, { provide: LEASE_REPOSITORY, useClass: PrismaLeaseRepository }],
})
export class LeaseModule {}
