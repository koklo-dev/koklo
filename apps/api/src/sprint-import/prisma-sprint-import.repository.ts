import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../clock.ts";
import { PrismaSprintStore } from "../sprint/prisma-sprint.repository.ts";
import { PrismaTicketStore } from "../ticket/prisma-ticket.repository.ts";
import { ProjectTransactions } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { ImportStores, SprintImportRepository } from "./sprint-import.repository.ts";

/** Un lot entier (86 tickets, centaines d'écritures) dépasse le délai de 5 s de Prisma. */
const IMPORT_TRANSACTION_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class PrismaSprintImportRepository implements SprintImportRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  run<T>(scope: ProjectScope, work: (stores: ImportStores) => Promise<T>): Promise<T> {
    return this.transactions.run(
      scope,
      (tx) =>
        work({
          tickets: new PrismaTicketStore(tx, scope, this.clock),
          sprints: new PrismaSprintStore(tx, scope),
        }),
      { timeoutMs: IMPORT_TRANSACTION_TIMEOUT_MS },
    );
  }
}
