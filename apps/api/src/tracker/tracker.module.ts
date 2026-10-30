import { Module } from "@nestjs/common";
import { OldestProjectContext, PROJECT_CONTEXT } from "../project/project-context.ts";
import { ProjectTransactions } from "./project-transactions.ts";

/** Briques communes aux modules ticket et sprint : projet courant et transactions de projet. */
@Module({
  providers: [ProjectTransactions, { provide: PROJECT_CONTEXT, useClass: OldestProjectContext }],
  exports: [ProjectTransactions, PROJECT_CONTEXT],
})
export class TrackerModule {}
