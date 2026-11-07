import { Module } from "@nestjs/common";
import { FullTextSearch } from "./full-text-search.ts";
import { ProjectTransactions } from "./project-transactions.ts";

/** Briques communes aux modules ticket et sprint : transactions de projet et recherche plein texte. */
@Module({
  providers: [ProjectTransactions, FullTextSearch],
  exports: [ProjectTransactions, FullTextSearch],
})
export class TrackerModule {}
