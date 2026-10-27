import { Module } from "@nestjs/common";
import { DATABASE_PROBE } from "./database-probe.ts";
import { HealthController } from "./health.controller.ts";
import { HealthService } from "./health.service.ts";
import { PrismaDatabaseProbe } from "./prisma-database-probe.ts";

@Module({
  controllers: [HealthController],
  providers: [HealthService, { provide: DATABASE_PROBE, useClass: PrismaDatabaseProbe }],
})
export class HealthModule {}
