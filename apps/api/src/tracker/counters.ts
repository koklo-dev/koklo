import type { Tx } from "./project-transactions.ts";
import type { ProjectScope } from "./scope.ts";

/**
 * Valeur suivante du compteur de clés (`TK-n`, `SP-n`) du projet, dans la transaction appelante.
 * L'insertion « si absent » ne fait rien en cas de course ; l'incrément pose ensuite un verrou de
 * ligne qui sérialise les créations concurrentes jusqu'à la fin de la transaction : jamais deux
 * fois la même valeur, un trou seulement si la transaction échoue (le compteur ne recule pas).
 */
export async function nextCounterValue(
  tx: Tx,
  scope: ProjectScope,
  name: "ticket" | "sprint",
): Promise<number> {
  const { organizationId, projectId } = scope;
  await tx.projectCounter.createMany({
    data: [{ organizationId, projectId, name }],
    skipDuplicates: true,
  });
  const counter = await tx.projectCounter.update({
    where: { projectId_name: { projectId, name } },
    data: { lastValue: { increment: 1 } },
    select: { lastValue: true },
  });
  return counter.lastValue;
}

/**
 * Relève le compteur à au moins `atLeast` (clés explicites d'un import) ; ne le fait jamais reculer
 * (la comparaison est dans la requête, en plus du déclencheur de base qui interdit toute baisse).
 */
export async function raiseCounterTo(
  tx: Tx,
  scope: ProjectScope,
  name: "ticket" | "sprint",
  atLeast: number,
): Promise<void> {
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
