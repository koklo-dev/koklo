import type { Tx } from "../tracker/project-transactions.ts";
import { type TechnicalFacts, technicalCounts } from "./technical-values.ts";

/** Comptes du cahier technique d'un instantané (`spec.head`, vue client) : index d'entités et `spec_endpoints`. */
export async function readTechnicalCounts(tx: Tx, snapshotId: string) {
  const count = (kind: string) => tx.specEntity.count({ where: { snapshotId, kind } });
  const [stack, endpoint, nfr, restEndpoints, file] = await Promise.all([
    count("stack"),
    count("endpoint"),
    count("nfr"),
    tx.specEndpoint.count({ where: { snapshotId } }),
    tx.specEntity.findFirst({
      where: { snapshotId, kind: "environments" },
      select: { data: true },
    }),
  ]);
  const facts: TechnicalFacts = {
    stack,
    endpoint,
    nfr,
    restEndpoints,
    environments: file?.data ?? null,
  };
  return technicalCounts(facts);
}
