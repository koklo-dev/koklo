export const DATABASE_PROBE = Symbol("DATABASE_PROBE");

/** Port de santé : résout si la base répond, rejette sinon. */
export interface DatabaseProbe {
  ping(): Promise<void>;
}
