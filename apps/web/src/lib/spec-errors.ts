import type { Role } from "@koklo/contract";
import { errorCode, errorData } from "./api-error.ts";
import { canManage, canReadRepos } from "./roles.ts";

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
  /** `index-failed` seulement : code de l'échec et version lue, pour la ligne technique de l'équipe. */
  failure?: { errorCode: string | null; commitSha: string | null };
}

const INDEX_FAILURES: Record<string, string> = {
  spec_too_large: "La spec de ce projet est trop volumineuse pour être lue par Koklo.",
};
const INDEX_FAILURE_FALLBACK = "La spec de ce projet contient un problème qui empêche sa lecture.";

/** Consigne GitHub de l'état « détail indisponible » (lien pour propriétaire et administrateur). */
export const GITHUB_CHECK = "Vérifiez l'état de l'application GitHub";

/** Phrase de l'état « La spec n'a pas pu être lue » d'après `errorCode` (table fermée, jamais la valeur brute). */
export function describeIndexFailure(code: string | null | undefined): string {
  return (
    (code && Object.hasOwn(INDEX_FAILURES, code) ? INDEX_FAILURES[code] : undefined) ??
    INDEX_FAILURE_FALLBACK
  );
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

const unavailable = (role: Role | undefined): FeatureErrorView => ({
  kind: "unavailable",
  title: "Le détail est momentanément indisponible",
  text: `La liste reste consultable. Réessayez dans un instant.${
    canReadRepos(role) ? ` ${GITHUB_CHECK}` : ""
  }`,
  retry: true,
  githubLink: canManage(role),
});

const authExpired = (role: Role | undefined): FeatureErrorView => ({
  kind: "auth-expired",
  title: "Koklo n'a plus accès au dépôt de spec",
  text: canManage(role)
    ? "Autorisez de nouveau Koklo sur GitHub, puis revenez à cette fiche."
    : "Demandez à un propriétaire ou à un administrateur d'autoriser de nouveau Koklo.",
  retry: false,
  githubLink: canManage(role),
});

function indexFailed(error: unknown): FeatureErrorView {
  const data = errorData(error);
  const code = textOrNull(data?.errorCode);
  return {
    kind: "index-failed",
    title: "La spec n'a pas pu être lue",
    text: describeIndexFailure(code),
    retry: false,
    githubLink: false,
    failure: { errorCode: code, commitSha: textOrNull(data?.commitSha) },
  };
}

/** État de la fiche d'après l'erreur de `spec.getFeature` (design/screens/S-features.md §4.11). */
export function describeFeatureError(error: unknown, role: Role | undefined): FeatureErrorView {
  switch (errorCode(error)) {
    case "NOT_FOUND":
      return {
        kind: "not-found",
        title: "Cette fonctionnalité n'existe plus dans la spec.",
        text: "",
        retry: false,
        githubLink: false,
      };
    case "PROVIDER_UNAVAILABLE":
      return unavailable(role);
    case "PROVIDER_RATE_LIMITED":
      return {
        kind: "rate-limited",
        title: "",
        text: "Trop de demandes pour le moment. Réessayez dans un instant.",
        retry: true,
        githubLink: false,
      };
    case "PROVIDER_AUTH_EXPIRED":
      return authExpired(role);
    case "SPEC_INDEX_FAILED":
      return indexFailed(error);
    default:
      return {
        kind: "generic",
        title: "Impossible de charger la fiche",
        text: "Une erreur est survenue. Vérifiez votre connexion puis réessayez.",
        retry: true,
        githubLink: false,
      };
  }
}
