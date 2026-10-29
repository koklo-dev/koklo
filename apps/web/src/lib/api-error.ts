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
