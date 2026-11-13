import { Module } from "@nestjs/common";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { CommentController } from "./comment.controller.ts";
import { COMMENT_REPOSITORY } from "./comment.repository.ts";
import { CommentService } from "./comment.service.ts";
import { PrismaCommentRepository } from "./prisma-comment.repository.ts";

@Module({
  imports: [TrackerModule, SpecReadModule],
  controllers: [CommentController],
  providers: [CommentService, { provide: COMMENT_REPOSITORY, useClass: PrismaCommentRepository }],
})
export class CommentModule {}
