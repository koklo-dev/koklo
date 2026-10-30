/** Code d'une erreur du client oRPC (`UNAUTHORIZED`, `CONFLICT`, ...), ou undefined (réseau, autre). */
export function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code: unknown = Reflect.get(error, "code");
  return typeof code === "string" ? code : undefined;
}

/** Motif d'un `CONFLICT` (`slug_taken`, `already_member`, ...). */
export function conflictReason(error: unknown): string | undefined {
  if (errorCode(error) !== "CONFLICT") return undefined;
  const data: unknown = Reflect.get(error as object, "data");
  if (typeof data !== "object" || data === null) return undefined;
  const reason: unknown = Reflect.get(data, "reason");
  return typeof reason === "string" ? reason : undefined;
}

/** Charge `data` d'une erreur typée (`INVALID_TRANSITION` : `{ from, to }`), ou undefined. */
export function errorData(error: unknown): Record<string, unknown> | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const data: unknown = Reflect.get(error, "data");
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : undefined;
}
