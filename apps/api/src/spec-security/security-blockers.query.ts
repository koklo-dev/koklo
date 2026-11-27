import {
  blockerReasonOf,
  type SecurityBlockerReason,
  securityBlockers,
  type Threat,
} from "@koklo/schema";
import type { Tx } from "../tracker/project-transactions.ts";
import { tablesOf } from "./data-values.ts";
import { entriesOf, rowsOfKind } from "./security-values.ts";

/**
 * Motif du refus de « Valider » la Sécurité à un instantané (B804) : menace élevée sans parade, puis champ non classé ou
 * donnée sur une personne sans durée. Lu dans la transaction de la décision.
 */
export async function readSecurityBlocker(
  tx: Tx,
  snapshotId: string,
): Promise<SecurityBlockerReason | undefined> {
  const rows = await tx.specEntity.findMany({
    where: { snapshotId, kind: { in: ["threat", "sensitive", "table"] } },
    select: { kind: true, specId: true, path: true, data: true },
    take: 20_000,
  });
  return blockerReasonOf(
    securityBlockers({
      threats: rowsOfKind(rows, "threat").map((row) => row.data as unknown as Threat),
      data: { donnees: entriesOf(rows) },
      tables: tablesOf(rows),
    }),
  );
}
