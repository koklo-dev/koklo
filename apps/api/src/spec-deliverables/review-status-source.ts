import { Inject, Injectable } from "@nestjs/common";
import { readStatusFacts } from "../review/status-facts.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { ProjectTransactions } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { DeliverableStatuses, DeliverableStatusSource } from "./deliverable-status-source.ts";
import { ALL_TODO, deliverableStatusesOf } from "./deliverable-statuses.ts";

/**
 * Source de statuts du lot B : les validations par élément, par bloc et par livrable, comparées au contenu de la tête
 * (hachage des entités, à défaut le SHA de tête). Remplace la source du lot A sans changer le contrat ni le service.
 */
@Injectable()
export class ReviewStatusSource implements DeliverableStatusSource {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
  ) {}

  statuses(scope: ProjectScope): Promise<DeliverableStatuses> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, {});
      if (!found || found.snapshot.status === "failed") return ALL_TODO;
      return deliverableStatusesOf(await readStatusFacts(tx, scope, found.snapshot));
    });
  }
}
