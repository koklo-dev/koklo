import { Module } from "@nestjs/common";
import type { AppConfig } from "../config.ts";
import { APP_CONFIG } from "../database/database.module.ts";
import { GIT_PROVIDER, type GitProviderBinding } from "../repo/tokens.ts";
import { InstallationController } from "./installation.controller.ts";
import { INSTALLATION_REPOSITORY } from "./installation.repository.ts";
import { InstallationService } from "./installation.service.ts";
import { InstallationCallbackController } from "./installation-callback.controller.ts";
import { InstallationCallbackService } from "./installation-callback.service.ts";
import { INSTALLATION_FLOW, installationFlowOf } from "./installation-flow.ts";
import { PrismaInstallationRepository } from "./prisma-installation.repository.ts";

@Module({
  controllers: [InstallationController, InstallationCallbackController],
  providers: [
    InstallationService,
    InstallationCallbackService,
    { provide: INSTALLATION_REPOSITORY, useClass: PrismaInstallationRepository },
    {
      provide: INSTALLATION_FLOW,
      inject: [APP_CONFIG, GIT_PROVIDER],
      useFactory: (config: AppConfig, provider: GitProviderBinding) =>
        installationFlowOf(config, provider),
    },
  ],
})
export class InstallationModule {}
