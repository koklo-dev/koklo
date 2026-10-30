import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { notFound } from "./api-errors.ts";
import type { ProjectScope } from "./scope.ts";

type TenantTransactionClient = Parameters<
  Parameters<DatabaseService["client"]["$transaction"]>[0]
>[0];

/** Client Prisma d'une transaction ouverte : les extensions multi-tenant y restent actives. */
export type Tx = TenantTransactionClient;

/**
 * Unité de travail des modules tickets et sprints : une transaction sous `withOrganization`, dans
 * laquelle le projet est d'abord vérifié appartenir à l'organisation (NOT_FOUND sinon, avant toute
 * lecture ou écriture). Lecture, écriture, compteur et audit partagent cette transaction.
 */
@Injectable()
export class ProjectTransactions {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** `timeoutMs` : borne de la transaction (défaut Prisma : 5 s), à relever pour un lot (import). */
  run<T>(
    scope: ProjectScope,
    work: (tx: Tx) => Promise<T>,
    options: { timeoutMs?: number } = {},
  ): Promise<T> {
    return withOrganization(scope.organizationId, () =>
      this.database.client.$transaction(
        async (tx) => {
          const project = await tx.project.findFirst({
            where: { id: scope.projectId },
            select: { id: true },
          });
          if (!project) {
            throw notFound();
          }
          return work(tx);
        },
        options.timeoutMs === undefined ? undefined : { timeout: options.timeoutMs },
      ),
    );
  }
}
