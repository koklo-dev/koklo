import { CLIENT_ROLE, REVIEW_REMIND_ROLES } from "../auth/roles.ts";

/** Rôles qui relancent le client (B352) : la relance n'est pas une validation, elle ne dépend pas de la cible. */
export const REMINDERS: readonly string[] = REVIEW_REMIND_ROLES;

/** Cibles que `review.submit` accepte (les écrans restent masqués, D2). */
export type ReviewKind = "feature" | "baseline" | "flow" | "rules" | "roles" | "deliverable";

/** Livrables que le client valide quand il est invité (Fonctionnel et Design, B325 d) ; les autres sont techniques. */
const CLIENT_DELIVERABLES = ["functional", "design"] as const;
const TECHNICAL_DELIVERABLES = [
  "data",
  "architecture",
  "technical",
  "security",
  "quality",
] as const;

/** Sans client invité, la validation fonctionnelle revient à ces rôles (D1). */
const TEAM_FALLBACK = ["owner", "admin"] as const;
const TECHNICAL_VALIDATORS = ["owner", "admin", "dev"] as const;

const isOneOf = (list: readonly string[], value: string) => list.includes(value);

/** La cible relève du client quand il en existe un (D1) : tout le Fonctionnel et le livrable Design, pas la baseline. */
export function isDelegatedTarget(kind: ReviewKind, ref: string): boolean {
  if (kind === "baseline") return false;
  return kind !== "deliverable" || isOneOf(CLIENT_DELIVERABLES, ref);
}

/**
 * Rôles autorisés à valider une cible. Décision serveur, d'après `hasClient` (lien `project_client_access`) et jamais
 * d'après l'entrée : fonctionnel et Design au client s'il y en a un, sinon owner ou admin ; livrables techniques à owner,
 * admin et développeur ; baseline au client seul. Une cible inconnue n'a aucun validateur.
 */
function validatorsOf(kind: ReviewKind, ref: string, hasClient: boolean): readonly string[] {
  if (kind === "baseline") return [CLIENT_ROLE];
  if (isDelegatedTarget(kind, ref)) return hasClient ? [CLIENT_ROLE] : TEAM_FALLBACK;
  return isOneOf(TECHNICAL_DELIVERABLES, ref) ? TECHNICAL_VALIDATORS : [];
}

export const canReview = (
  role: string | undefined,
  kind: ReviewKind,
  ref: string,
  hasClient: boolean,
): boolean => role !== undefined && isOneOf(validatorsOf(kind, ref, hasClient), role);

/**
 * Filtre Prisma de `review.list` pour le client (B325 e) : les cibles qu'il valide, jamais les livrables techniques.
 * Les écrans sont déjà exclus pour tous.
 */
export function clientListFilter() {
  const kinds: ReviewKind[] = ["feature", "baseline", "flow", "rules", "roles"];
  return {
    OR: [
      { targetKind: { in: kinds } },
      { targetKind: "deliverable" as const, targetRef: { in: [...CLIENT_DELIVERABLES] } },
    ],
  };
}
