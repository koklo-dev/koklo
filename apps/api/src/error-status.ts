import { errorStatusMap } from "@koklo/contract";
import { COMMON_ERROR_STATUS_MAP } from "@orpc/server";

/**
 * Statut HTTP par code d'erreur oRPC : codes communs + codes propres au contrat (INTERNAL…),
 * qui n'ont pas de statut par défaut. Source unique pour `ORPCModule` et `OrpcErrorFilter`.
 */
export const ERROR_STATUS_MAP = { ...COMMON_ERROR_STATUS_MAP, ...errorStatusMap };
