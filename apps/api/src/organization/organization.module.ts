import { Module } from "@nestjs/common";
import { OrganizationController } from "./organization.controller.ts";
import { OrganizationRepository } from "./organization.repository.ts";
import { OrganizationService } from "./organization.service.ts";

@Module({
  controllers: [OrganizationController],
  providers: [OrganizationService, OrganizationRepository],
})
export class OrganizationModule {}
