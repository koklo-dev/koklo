import { randomUUID } from "node:crypto";
import { captureError } from "@koklo/observability";
import { ORPCError } from "@orpc/server";
import { requestLogger } from "./request-logger.ts";

const MAX_REQUEST_ID_LENGTH = 128;

/** Constructeur de l'erreur typée `INTERNAL` du contrat, tel que fourni au handler (`errors`). */
export interface InternalErrors {
  INTERNAL: (options: { data: { requestId: string } }) => Error;
}

/** `x-request-id` entrant s'il est présent (borné), sinon un UUID. */
export function requestIdFrom(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value ? value.slice(0, MAX_REQUEST_ID_LENGTH) : randomUUID();
}

/** Identifiant fixé par le logger de requêtes (même valeur que dans les journaux), sinon l'en-tête. */
export function requestIdOf(request: {
  id?: unknown;
  headers: Record<string, string | string[] | undefined>;
}): string {
  return typeof request.id === "string"
    ? request.id
    : requestIdFrom(request.headers["x-request-id"]);
}

/**
 * Aucune exception inattendue ne sort telle quelle (CDC §17.1) : elle devient l'erreur typée
 * `INTERNAL`. Le détail va au journal (nom de l'erreur seulement : un message de driver peut
 * citer l'hôte), jamais dans la réponse, et part au SDK d'erreurs (qui ne doit pas la bloquer). Une ORPCError
 * est levée volontairement : elle passe.
 */
export async function guard<T>(
  requestId: string,
  errors: InternalErrors,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ORPCError) {
      throw error;
    }
    requestLogger().error(
      { requestId, errorName: error instanceof Error ? error.name : "erreur" },
      "unhandled error",
    );
    captureError(error, { requestId });
    throw errors.INTERNAL({ data: { requestId } });
  }
}
