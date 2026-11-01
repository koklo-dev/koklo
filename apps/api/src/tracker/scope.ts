import type { Request } from "express";
import { requireSession } from "../auth/session.guard.ts";
import type { ProjectAccess } from "../project/project-access.ts";
import type { ProjectContext } from "../project/project-context.ts";
import { guard, type InternalErrors, requestIdOf } from "../request-context.ts";

/**
 * Portée de toute opération tickets/sprints : l'organisation et l'acteur viennent de la session,
 * le projet du contexte de projet. Rien ne vient de l'entrée du client.
 */
export interface ProjectScope {
  organizationId: string;
  projectId: string;
  userId: string;
}

export async function scopeOf(
  request: Request,
  project: ProjectContext,
  _access?: ProjectAccess,
): Promise<ProjectScope> {
  const { organizationId, userId } = requireSession(request);
  return { organizationId, userId, projectId: await project.projectId(request) };
}

/** Exécute `work` dans la portée de la requête, toute erreur inattendue devenant `INTERNAL`. */
export function inScope<T>(
  request: Request,
  project: ProjectContext,
  errors: InternalErrors,
  work: (scope: ProjectScope) => Promise<T>,
  access?: ProjectAccess,
): Promise<T> {
  return guard(requestIdOf(request), errors, async () =>
    work(await scopeOf(request, project, access)),
  );
}

/**
 * Variante à projet explicite (entrée `projectId`, procédures hors du contexte de projet) :
 * l'organisation et l'acteur viennent toujours de la session ; l'appartenance du projet à
 * l'organisation est vérifiée par la première lecture de l'opération (`NOT_FOUND` sinon).
 */
export function inProject<T>(
  request: Request,
  errors: InternalErrors,
  projectId: string,
  work: (scope: ProjectScope) => Promise<T>,
  _access?: ProjectAccess,
): Promise<T> {
  const { organizationId, userId } = requireSession(request);
  return guard(requestIdOf(request), errors, () => work({ organizationId, userId, projectId }));
}
