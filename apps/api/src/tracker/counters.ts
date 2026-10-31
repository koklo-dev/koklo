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
  name: "ticket" | "sprint" | "feature",
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
