import type { TenantClient } from "./tenant-extension.ts";

/** Client d'une transaction du client multi-tenant (`createDbClient(...).$transaction`). */
export type TenantTx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

export type CounterScope = { readonly organizationId: string; readonly projectId: string };
export type CounterName = "ticket" | "sprint" | "feature";

const COUNTER_MAX = 2_147_483_647;

/**
 * Relève le compteur à au moins `atLeast` (clés explicites d'un import, `feature` du worker) ;
 * ne le fait jamais reculer (la comparaison est dans la requête, en plus du déclencheur de base
 * qui interdit toute baisse). `atLeast` doit être un entier de 0 à 2 147 483 647, sinon
 * `RangeError` avant toute écriture.
 */
export async function raiseCounterTo(
  tx: TenantTx,
  scope: CounterScope,
  name: CounterName,
  atLeast: number,
): Promise<void> {
  if (!Number.isInteger(atLeast) || atLeast < 0 || atLeast > COUNTER_MAX) {
    throw new RangeError(`Counter value must be an integer between 0 and ${COUNTER_MAX}`);
  }
  const { organizationId, projectId } = scope;
  await tx.projectCounter.createMany({
    data: [{ organizationId, projectId, name }],
    skipDuplicates: true,
  });
  await tx.projectCounter.updateMany({
    where: { projectId, name, lastValue: { lt: atLeast } },
    data: { lastValue: atLeast },
  });
}
