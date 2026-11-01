import { ORPCError } from "@orpc/server";
import { validation } from "./tracker/api-errors.ts";

/**
 * Routes (`MÉTHODE chemin` du contrat) dont le refus du schéma ressort en `VALIDATION` (422) et
 * non en `BAD_REQUEST` (400) : un commentaire vide ou trop long est une saisie invalide au même
 * titre qu'une cible qui n'est pas un UUID (`targetId`, contrat 0.5.0), en création comme en liste.
 * Les lectures de la spec en relèvent aussi : `branch` et `commitSha` exclusifs, filtre ou limite inconnus
 * (contrat 0.6.0). Les clés BYOK aussi : fournisseur inconnu, clé ou modèle refusés (contrat 0.8.0), comme les propositions de l'IA et la vérification d'une clé (0.9.0). Les liens client <-> projet aussi :
 * identifiant de projet ou de membre mal formé (contrat 0.10.0).
 */
const VALIDATION_ROUTES = new Set([
  "POST /comments",
  "GET /comments",
  "GET /projects/{projectId}/spec",
  "GET /projects/{projectId}/spec/features",
  "PUT /llm-credentials/{provider}",
  "DELETE /llm-credentials/{provider}",
  "POST /llm-credentials/{provider}/invalidate",
  "POST /llm-credentials/{provider}/verify",
  "POST /projects/{projectId}/ai/brief",
  "POST /projects/{projectId}/ai/features",
  "POST /projects/{projectId}/ai/criteria",
  "GET /projects/{projectId}/clients",
  "POST /projects/{projectId}/clients",
  "DELETE /projects/{projectId}/clients/{memberId}",
]);

interface RouteMeta {
  "~openapi"?: { method?: string; path?: string };
}

interface SchemaIssue {
  path?: PropertyKey[];
  message?: string;
}

/**
 * `VALIDATION` pour un refus de schéma d'entrée seulement : un `BAD_REQUEST` d'oRPC porte la liste
 * `data.issues` de la validation. Toute autre erreur (sans `issues`, ou d'un autre code) est rendue
 * telle quelle : l'intercepteur ne masque jamais une erreur qui n'est pas un refus de schéma.
 */
function asValidation(error: unknown): unknown {
  if (!(error instanceof ORPCError) || error.code !== "BAD_REQUEST") {
    return error;
  }
  const issues = (error.data as { issues?: unknown } | undefined)?.issues;
  const first = Array.isArray(issues) ? (issues[0] as SchemaIssue | undefined) : undefined;
  if (!first) {
    return error;
  }
  return validation(String(first.path?.[0] ?? "input"), first.message ?? "Entrée invalide");
}

/** Intercepteur de client oRPC (`ORPCModule.forRoot({ clientInterceptors })`). */
export async function validationStatusInterceptor<R>(options: {
  procedure: { "~orpc": { meta?: unknown } };
  next: () => R | PromiseLike<R>;
}): Promise<R> {
  try {
    return await options.next();
  } catch (error) {
    const route = (options.procedure["~orpc"].meta as RouteMeta | undefined)?.["~openapi"];
    throw VALIDATION_ROUTES.has(`${route?.method} ${route?.path}`) ? asValidation(error) : error;
  }
}
