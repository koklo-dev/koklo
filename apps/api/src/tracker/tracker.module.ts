import { Module } from "@nestjs/common";
import { OldestProjectContext, PROJECT_CONTEXT } from "../project/project-context.ts";
import { FullTextSearch } from "./full-text-search.ts";
import { ProjectTransactions } from "./project-transactions.ts";

/** Briques communes aux modules ticket et sprint : projet courant et transactions de projet. */
@Module({
  providers: [
    ProjectTransactions,
    FullTextSearch,
    { provide: PROJECT_CONTEXT, useClass: OldestProjectContext },
  ],
  exports: [ProjectTransactions, FullTextSearch, PROJECT_CONTEXT],
})
export class TrackerModule {}
