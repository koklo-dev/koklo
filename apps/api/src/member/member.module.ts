import { Module } from "@nestjs/common";
import { MemberController } from "./member.controller.ts";
import { MemberRepository } from "./member.repository.ts";
import { MemberService } from "./member.service.ts";

@Module({
  controllers: [MemberController],
  providers: [MemberService, MemberRepository],
})
export class MemberModule {}
