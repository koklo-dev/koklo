import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { mountFirst } from "../webhook/webhook-body-parser.ts";
import { PrismaSpecBatchRepository } from "./prisma-spec-batch.repository.ts";
import { SpecBatchController } from "./spec-batch.controller.ts";
import { SPEC_BATCH_REPOSITORY } from "./spec-batch.repository.ts";
import { SpecBatchService } from "./spec-batch.service.ts";
import { specBatchBodyParser } from "./spec-batch-body-parser.ts";
import { SpecWriteQueue } from "./spec-write.queue.ts";

@Module({
  imports: [TrackerModule],
  controllers: [SpecBatchController],
  providers: [
    SpecBatchService,
    SpecWriteQueue,
    { provide: SPEC_BATCH_REPOSITORY, useClass: PrismaSpecBatchRepository },
  ],
  // `IdeaModule` (TK-89) enregistre ses lots de publication par ce service.
  exports: [SpecBatchService],
})
export class SpecBatchModule implements OnModuleInit {
  constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}

  onModuleInit(): void {
    // Contexte d'application sans serveur HTTP (CLI d'import) : aucune route à servir.
    const server = this.adapter.httpAdapter;
    if (!server) return;
    mountFirst(server.getInstance(), specBatchBodyParser());
  }
}
