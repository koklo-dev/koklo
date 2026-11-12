import type { Tx } from "../tracker/project-transactions.ts";

/**
 * Un client est-il invité au projet ? Oui quand au moins un lien `project_client_access` est actif (B325 a) ; une
 * invitation en attente ne compte pas. Définition unique, lue par la vue d'ensemble et par la politique de validation (D1).
 */
export const hasClientOf = (links: readonly unknown[]): boolean => links.length > 0;

/** Même définition, lue en base : un seul lien suffit. */
export async function hasLinkedClient(tx: Tx, projectId: string): Promise<boolean> {
  const link = await tx.projectClientAccess.findFirst({
    where: { projectId },
    select: { id: true },
  });
  return link !== null;
}
