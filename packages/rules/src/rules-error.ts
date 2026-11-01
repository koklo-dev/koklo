/** Erreurs typées de la composition (TK-71 lot B). Les fonctions du lot ne lèvent jamais. */
export const RULES_ERROR_CODES = [
  "layer.invalid-shape",
  "layer.invalid-level",
  "layer.duplicate-level",
  "layer.collision",
  "layer.invalid-pattern",
  "waiver.missing-expires",
  "waiver.invalid-expires",
  "resolve.invalid-role",
  "resolve.invalid-path",
  "resolve.invalid-now",
  "resolve.unknown-profile",
] as const;
export type RulesErrorCode = (typeof RULES_ERROR_CODES)[number];

export interface RulesError {
  readonly code: RulesErrorCode;
  readonly message: string;
  /** Chemin dans le document (ex. `waivers.0.expires`), absent si non applicable. */
  readonly path?: string;
}

export type RulesResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RulesError };

/** Erreur de la composition ; `path` est omis (jamais `undefined`) pour rester sérialisable. */
export const rulesError = (code: RulesErrorCode, message: string, path?: string): RulesError =>
  path === undefined || path === "" ? { code, message } : { code, message, path };
