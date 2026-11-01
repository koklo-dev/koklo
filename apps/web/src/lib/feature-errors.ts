import type { Role, ValidationReport } from "@koklo/contract";
import { errorCode, errorData } from "./api-error.ts";
import { canManage } from "./roles.ts";

/**
 * Table unique des échecs d'enregistrement (S-feature-form §4.7), pour l'erreur
 * de `specBatch.submit` comme pour un lot terminal relu par `specBatch.get`.
 */
export type SaveFailure =
  | { source: "submit"; error: unknown }
  | {
      source: "batch";
      batch: { status: string; errorCode: string | null; report?: ValidationReport | null };
    };

export type SaveErrorKind =
  | "network"
  | "internal"
  | "unavailable"
  | "rate-limited"
  | "auth-expired"
  | "forbidden"
  | "forbidden-designer"
  | "not-found"
  | "spec-invalid"
  | "stale-base"
  | "write-conflict"
  | "key-reused"
  | "validation"
  | "generic";
export type SaveErrorAction =
  | "retry"
  | "check-list"
  | "reload"
  | "goto-links"
  | "close"
  | "github"
  | "projects";

export interface SaveErrorView {
  kind: SaveErrorKind;
  title: string;
  text: string;
  actions: SaveErrorAction[];
  /** Le prochain envoi prépare une nouvelle clé d'idempotence (faux pour une absence de réponse ou un `INTERNAL` de `submit`). */
  freshKey: boolean;
  /** Lien `/github` proposé (propriétaire et administrateur seulement). */
  githubLink: boolean;
  /** `INTERNAL` : référence à montrer à l'équipe. */
  requestId?: string;
  /** `VALIDATION` : champ du serveur. */
  field?: string;
  /** `SPEC_INVALID` : diagnostics (100 au plus) et indicateur de troncature. */
  report?: ValidationReport;
}

export interface SaveErrorContext {
  role: Role | undefined;
  mode: "create" | "update";
}

/** Libellé du lien `/github` glissé dans le texte de l'indisponibilité (le composant le rend en lien). */
export const GITHUB_STATUS_LINK = "Vérifier l'état de l'application GitHub";

const RETRY_LATER = "Rien n'a été écrit. Réessayez dans un instant.";

type Entry = Omit<SaveErrorView, "githubLink"> & { githubLink?: boolean };
const entry = (
  kind: SaveErrorKind,
  title: string,
  text: string,
  actions: SaveErrorAction[],
  freshKey = true,
): Entry => ({ kind, title, text, actions, freshKey });

const GENERIC = entry(
  "generic",
  "Enregistrement impossible",
  "L'enregistrement n'a pas abouti. Votre saisie est gardée.",
  ["retry"],
);

const TEXTS: Record<string, Entry> = {
  network: entry(
    "network",
    "Impossible de confirmer l'enregistrement",
    "Votre connexion a été interrompue. Réessayer ne créera pas de doublon.",
    ["retry"],
    false,
  ),
  PROVIDER_RATE_LIMITED: entry("rate-limited", "Trop de demandes pour le moment", RETRY_LATER, [
    "retry",
  ]),
  SPEC_INVALID: entry(
    "spec-invalid",
    "La spec obtenue ne serait pas valide",
    "Rien n'a été écrit. Corrigez les points ci-dessous.",
    [],
  ),
  stale_base: entry(
    "stale-base",
    "La spec a changé depuis que vous avez ouvert ce formulaire",
    "Rien n'a été écrit. Rechargez la version actuelle : vos modifications sont conservées.",
    ["reload"],
  ),
  idempotency_key_reused: entry(
    "key-reused",
    "Cet envoi ne peut pas être repris tel quel",
    "Réessayez : un nouvel envoi sera préparé avec votre saisie.",
    ["retry"],
  ),
  VALIDATION: entry(
    "validation",
    "Une valeur est refusée",
    "Vérifiez la saisie puis enregistrez de nouveau.",
    [],
  ),
  NOT_FOUND: entry(
    "not-found",
    "Ce projet n'a plus de dépôt de spec",
    "Ou il n'existe plus. Votre saisie est gardée.",
    ["projects", "close"],
  ),
};

/**
 * `INTERNAL` : le serveur a peut-être écrit. Après la réponse de `submit` (inconnue), le réessai reprend la même clé
 * pour une saisie identique : le serveur rejoue le résultat au lieu de créer un doublon. Un lot terminal
 * `failed`/`INTERNAL` relu par `specBatch.get` est un échec connu : nouvelle clé.
 */
function internal(requestId: unknown, knownFailure: boolean): Entry {
  return {
    ...entry(
      "internal",
      "Nous ne savons pas si l'enregistrement a abouti",
      "Vérifiez la liste avant de réessayer, pour ne pas créer deux fois la même fonctionnalité.",
      ["check-list", "retry"],
      knownFailure,
    ),
    ...(typeof requestId === "string" ? { requestId } : {}),
  };
}

function unavailable(manager: boolean): Entry {
  return {
    ...entry(
      "unavailable",
      "GitHub est momentanément indisponible",
      manager ? `${RETRY_LATER} ${GITHUB_STATUS_LINK}` : RETRY_LATER,
      ["retry"],
    ),
    githubLink: manager,
  };
}

function authExpired(manager: boolean): Entry {
  return {
    ...entry(
      "auth-expired",
      "Koklo n'a plus accès au dépôt de spec",
      manager
        ? "Autorisez de nouveau Koklo sur GitHub, puis revenez enregistrer : votre saisie est gardée."
        : "Demandez à un propriétaire ou à un administrateur d'autoriser de nouveau Koklo.",
      manager ? ["github", "close"] : ["close"],
    ),
    githubLink: manager,
  };
}

function forbidden(role: Role | undefined): Entry {
  if (role === "designer") {
    return entry(
      "forbidden-designer",
      "Vous ne pouvez enregistrer que les fonctionnalités liées à un écran",
      "Ajoutez un écran dans « Éléments liés », ou demandez à un développeur.",
      ["goto-links", "close"],
    );
  }
  return entry(
    "forbidden",
    "Enregistrement refusé",
    "Vous n'avez pas le droit d'enregistrer dans la spec.",
    ["close"],
  );
}

function writeConflict(mode: SaveErrorContext["mode"]): Entry {
  return mode === "create"
    ? entry(
        "write-conflict",
        "La spec a bougé pendant l'enregistrement",
        "La spec a bougé pendant l'enregistrement. Réessayez.",
        ["retry"],
      )
    : entry(
        "write-conflict",
        "Cette fonctionnalité a changé ou n'existe plus dans la spec",
        "Rechargez-la pour voir où elle en est.",
        ["reload"],
      );
}

/** Code d'échec et motif de conflit d'une erreur de `submit` (aucun code = réseau) ou d'un lot terminal. */
function classify(failure: SaveFailure): { code: string; reason?: string } {
  if (failure.source === "submit") {
    const code = errorCode(failure.error);
    if (code === undefined) return { code: "network" };
    const reason = errorData(failure.error)?.reason;
    return { code, ...(typeof reason === "string" ? { reason } : {}) };
  }
  const { status, errorCode: code } = failure.batch;
  if (status === "conflict" && code) return { code: "SPEC_BATCH_CONFLICT", reason: code };
  if (status === "failed" && code) return { code };
  return { code: "unknown" };
}

function entryFor(failure: SaveFailure, context: SaveErrorContext): Entry {
  const { code, reason } = classify(failure);
  const manager = canManage(context.role);
  const data = failure.source === "submit" ? errorData(failure.error) : undefined;
  switch (code) {
    case "INTERNAL":
      return internal(data?.requestId, failure.source === "batch");
    case "PROVIDER_UNAVAILABLE":
      return unavailable(manager);
    case "PROVIDER_AUTH_EXPIRED":
      return authExpired(manager);
    case "FORBIDDEN":
      return forbidden(context.role);
    case "SPEC_BATCH_CONFLICT":
      if (reason === "write_conflict") return writeConflict(context.mode);
      return (reason && Object.hasOwn(TEXTS, reason) ? TEXTS[reason] : undefined) ?? GENERIC;
    default:
      return (Object.hasOwn(TEXTS, code) ? TEXTS[code] : undefined) ?? GENERIC;
  }
}

function reportOf(failure: SaveFailure): ValidationReport | undefined {
  if (failure.source === "batch") return failure.batch.report ?? undefined;
  const report = errorData(failure.error)?.report;
  return typeof report === "object" && report !== null ? (report as ValidationReport) : undefined;
}

export function describeSaveError(failure: SaveFailure, context: SaveErrorContext): SaveErrorView {
  const found = entryFor(failure, context);
  const view: SaveErrorView = { ...found, githubLink: found.githubLink ?? false };
  if (found.kind === "spec-invalid") {
    const report = reportOf(failure);
    if (report) view.report = report;
  }
  if (found.kind === "validation" && failure.source === "submit") {
    const field = errorData(failure.error)?.field;
    if (typeof field === "string") view.field = field;
  }
  return view;
}
