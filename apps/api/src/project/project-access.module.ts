import { Global, Module } from "@nestjs/common";
import { PrismaProjectAccess } from "./prisma-project-access.ts";
import { PROJECT_ACCESS } from "./project-access.ts";

/** Cloisonnement par projet, partagé par tous les modules qui résolvent un projet (TK-55a). */
@Global()
@Module({
  providers: [{ provide: PROJECT_ACCESS, useClass: PrismaProjectAccess }],
  exports: [PROJECT_ACCESS],
})
export class ProjectAccessModule {}
