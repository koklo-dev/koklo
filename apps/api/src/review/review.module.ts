import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaReviewRepository } from "./prisma-review.repository.ts";
import { ReviewController } from "./review.controller.ts";
import { REVIEW_REPOSITORY } from "./review.repository.ts";
import { ReviewService } from "./review.service.ts";

/** Le service n'est pas exporté : seul le contrôleur écrit une validation (session humaine). */
@Module({
  imports: [TrackerModule, SpecReadModule, NotificationModule],
  controllers: [ReviewController],
  providers: [ReviewService, { provide: REVIEW_REPOSITORY, useClass: PrismaReviewRepository }],
})
export class ReviewModule {}
