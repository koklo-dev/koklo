import type { Request } from "express";
import { requireSession } from "../auth/session.guard.ts";
import type { ProjectAccess } from "../project/project-access.ts";
import { guard, type InternalErrors, requestIdOf } from "../request-context.ts";

/**
 * Portée de toute opération de projet : l'organisation et l'acteur viennent de la session, le projet
 * de l'entrée (`projectId`) dont l'accès est contrôlé (cloisonnement) avant tout travail.
 */
export interface ProjectScope {
  organizationId: string;
  projectId: string;
  userId: string;
}

/**
 * Exécute `work` dans la portée d'un projet désigné par l'entrée (`projectId`, TK-96) : l'organisation
 * et l'acteur viennent toujours de la session ; l'accès au projet (existence dans l'organisation, lien
 * pour un rôle cloisonné) est contrôlé AVANT le travail (`NOT_FOUND` uniforme sinon). Toute erreur
 * inattendue devient `INTERNAL`.
 */
export function inProject<T>(
  request: Request,
  errors: InternalErrors,
  projectId: string,
  work: (scope: ProjectScope) => Promise<T>,
  access: ProjectAccess,
): Promise<T> {
  const session = requireSession(request);
  return guard(requestIdOf(request), errors, async () => {
    await access.assertAccessible(session, projectId);
    return work({ organizationId: session.organizationId, userId: session.userId, projectId });
  });
}
