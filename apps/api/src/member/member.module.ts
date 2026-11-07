import { Module } from "@nestjs/common";
import { InvitationModule } from "../invitation/invitation.module.ts";
import { MemberController } from "./member.controller.ts";
import { MemberRepository } from "./member.repository.ts";
import { MemberService } from "./member.service.ts";

@Module({
  imports: [InvitationModule],
  controllers: [MemberController],
  providers: [MemberService, MemberRepository],
})
export class MemberModule {}
