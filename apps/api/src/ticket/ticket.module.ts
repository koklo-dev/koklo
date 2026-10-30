import { Module } from "@nestjs/common";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { DependencyController } from "./dependency.controller.ts";
import { PrismaTicketRepository } from "./prisma-ticket.repository.ts";
import { TicketController } from "./ticket.controller.ts";
import { TICKET_REPOSITORY } from "./ticket.repository.ts";
import { TicketService } from "./ticket.service.ts";

@Module({
  imports: [TrackerModule],
  controllers: [TicketController, DependencyController],
  providers: [TicketService, { provide: TICKET_REPOSITORY, useClass: PrismaTicketRepository }],
})
export class TicketModule {}
