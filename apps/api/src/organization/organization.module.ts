import { Module } from "@nestjs/common";
import { OrganizationController } from "./organization.controller.ts";
import { OrganizationRepository } from "./organization.repository.ts";
import { OrganizationService } from "./organization.service.ts";
import { OrganizationCreatorGuard } from "./organization-creator.guard.ts";

@Module({
  controllers: [OrganizationController],
  providers: [OrganizationService, OrganizationRepository, OrganizationCreatorGuard],
})
export class OrganizationModule {}
