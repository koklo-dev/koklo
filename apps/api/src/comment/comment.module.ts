import { Module } from "@nestjs/common";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { CommentController } from "./comment.controller.ts";
import { COMMENT_REPOSITORY } from "./comment.repository.ts";
import { CommentService } from "./comment.service.ts";
import { PrismaCommentRepository } from "./prisma-comment.repository.ts";

@Module({
  imports: [TrackerModule],
  controllers: [CommentController],
  providers: [CommentService, { provide: COMMENT_REPOSITORY, useClass: PrismaCommentRepository }],
})
export class CommentModule {}
