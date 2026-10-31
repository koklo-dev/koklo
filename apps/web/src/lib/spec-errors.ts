import type { Role } from "@koklo/contract";

export type FeatureErrorKind =
  | "not-found"
  | "unavailable"
  | "rate-limited"
  | "auth-expired"
  | "index-failed"
  | "generic";

export interface FeatureErrorView {
  kind: FeatureErrorKind;
  title: string;
  text: string;
  /** Un bouton « Réessayer » est proposé. */
  retry: boolean;
  /** Un lien `/github` est proposé (propriétaire et administrateur seulement). */
  githubLink: boolean;
}

const TODO = "spec-errors: non implémenté";

/** Phrase de l'état « La spec n'a pas pu être lue » d'après `errorCode` (table fermée, jamais la valeur brute). */
export function describeIndexFailure(_errorCode: string | null | undefined): string {
  throw new Error(TODO);
}

/** État de la fiche d'après l'erreur de `spec.getFeature` (design/screens/S-features.md §4.11). */
export function describeFeatureError(_error: unknown, _role: Role | undefined): FeatureErrorView {
  throw new Error(TODO);
}
