import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import { ORPCError } from "@orpc/server";

const MAX_REQUEST_ID_LENGTH = 128;
const logger = new Logger("Api");

/** Constructeur de l'erreur typée `INTERNAL` du contrat, tel que fourni au handler (`errors`). */
export interface InternalErrors {
  INTERNAL: (options: { data: { requestId: string } }) => Error;
}

/** `x-request-id` entrant s'il est présent (borné), sinon un UUID. */
export function requestIdFrom(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value ? value.slice(0, MAX_REQUEST_ID_LENGTH) : randomUUID();
}

/**
 * Aucune exception inattendue ne sort telle quelle (CDC §17.1) : elle devient l'erreur typée
 * `INTERNAL`. Le détail va au journal (nom de l'erreur seulement : un message de driver peut
 * citer l'hôte), jamais dans la réponse. Une ORPCError est levée volontairement : elle passe.
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
    logger.error(`requestId=${requestId} ${error instanceof Error ? error.name : "erreur"}`);
    throw errors.INTERNAL({ data: { requestId } });
  }
}
