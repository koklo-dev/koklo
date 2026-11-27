import {
  type AsvsFile,
  exposedSurfaces,
  surfacesToComplete,
  type Threat,
  unansweredRequirements,
  unclassifiedFields,
} from "@koklo/schema";
import { tablesOf } from "../spec-security/data-values.ts";
import { dataOf, entriesOf, rowsOfKind } from "../spec-security/security-values.ts";
import { OPERATIONS_ONLY } from "../spec-technical/operation-where.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { SecurityFacts } from "./launch.repository.ts";

const MAX_ROWS = 20_000;

/** Ce que l'agent de la Sécurité a à traiter à un instantané (B806), par les règles partagées avec le worker. */
export async function readSecurityFacts(tx: Tx, snapshotId: string): Promise<SecurityFacts> {
  const rows = await tx.specEntity.findMany({
    where: {
      snapshotId,
      OR: [
        { kind: { in: ["threat", "sensitive", "table", "asvs"] } },
        { kind: "endpoint", AND: OPERATIONS_ONLY },
      ],
    },
    select: { kind: true, specId: true, path: true, data: true },
    take: MAX_ROWS,
  });
  const features = await tx.specFeature.findMany({
    where: { snapshotId },
    select: { specId: true },
    take: MAX_ROWS,
  });
  const entries = entriesOf(rows);
  const exposed = exposedSurfaces(
    rowsOfKind(rows, "endpoint").map((row) => row.data as { sert?: string[] }),
    features.map((feature) => feature.specId),
  );
  const threats = rowsOfKind(rows, "threat").map((row) => row.data as unknown as Threat);
  return {
    surfaces: surfacesToComplete(exposed, threats).length,
    unclassified: unclassifiedFields({ donnees: entries }, tablesOf(rows)).length,
    unanswered: unansweredRequirements(dataOf<AsvsFile>(rows, "asvs"), entries).length,
  };
}
