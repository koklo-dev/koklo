import { Module } from "@nestjs/common";
import { InvitationController } from "./invitation.controller.ts";
import { InvitationRepository } from "./invitation.repository.ts";
import { InvitationService } from "./invitation.service.ts";

@Module({
  controllers: [InvitationController],
  providers: [InvitationService, InvitationRepository],
  exports: [InvitationService],
})
export class InvitationModule {}
