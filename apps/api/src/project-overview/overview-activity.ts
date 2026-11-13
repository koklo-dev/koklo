import type { ActivityItem } from "@koklo/contract";
import { initialsOf } from "./overview-texts.ts";

/**
 * Liste fermée des événements d'`audit_log` lisibles par un humain (B279). Tout autre événement, technique ou
 * d'une autre portée, n'apparaît jamais ; `system` non plus.
 */
export const CLIENT_ACTIVITY_ACTIONS = [
  "review.approve",
  "review.request_changes",
  "suggestion.create",
  "idea.freeze",
] as const;
export const ACTIVITY_ACTIONS = [
  ...CLIENT_ACTIVITY_ACTIONS,
  "idea.proposal.accept",
  "sprint.activate",
  "sprint.close",
  "spec.batch.submit",
  "project.create",
  "project_client.add",
  // TK-104 (B352) : relance du client ; réservée à l'équipe, jamais dans `CLIENT_ACTIVITY_ACTIONS`.
  "review.remind",
  // TK-109 (B454) : commentaire d'une table de données ; seuls ceux sans ticket (les commentaires de ticket n'y sont pas).
  "comment.create",
] as const;

/**
 * Filtre `audit_log` d'une liste d'événements : `comment.create` ne compte que sans ticket (commentaire de table), les
 * commentaires de ticket restent hors du journal lisible.
 */
export function activityActionsFilter(actions: readonly string[]) {
  return {
    OR: [
      { action: { in: actions.filter((action) => action !== "comment.create") } },
      ...(actions.includes("comment.create") ? [{ action: "comment.create", ticketId: null }] : []),
    ],
  };
}

/** Un événement du journal et ce que la jointure en a retenu ; rien d'autre n'atteint le texte. */
export interface ActivityRow {
  action: string;
  occurredAt: Date;
  actorKind: "human" | "agent" | "runner" | "system";
  /** Nom d'affichage de l'utilisateur ; `null` si le compte n'existe plus. */
  actorName: string | null;
  actorRole: string | null;
  /** Cible lisible (« F-001 Réserver un créneau », « SG-3 », « SP-7 ») ; `null` si elle a disparu. */
  target: string | null;
}

type Phrase = (target: string | null) => string;
const PHRASES: Record<string, Phrase> = {
  "review.approve": (t) => `a validé ${t ?? "une fonctionnalité"}`,
  "review.request_changes": (t) => `a demandé des changements sur ${t ?? "une fonctionnalité"}`,
  "suggestion.create": (t) => (t ? `a ajouté la suggestion ${t}` : "a ajouté une suggestion"),
  "idea.freeze": () => "a publié une version du dossier d'idée",
  "idea.proposal.accept": () => "a accepté une proposition de l'agent",
  "sprint.activate": (t) => (t ? `a démarré le sprint ${t}` : "a démarré un sprint"),
  "sprint.close": (t) => (t ? `a clos le sprint ${t}` : "a clos un sprint"),
  "spec.batch.submit": () => "a enregistré des modifications de la spec",
  "project.create": () => "a créé le projet",
  "project_client.add": () => "a donné accès au projet à un client",
  // La cible est le prénom du client relancé ; un lien disparu donne « le client ».
  "review.remind": (t) => `a relancé ${t ?? "le client"}`,
  // La cible est l'identifiant `T-slug` de la table commentée ; un commentaire sans cible lisible reste une phrase complète.
  "comment.create": (t) => (t ? `a commenté la table ${t}` : "a commenté une table"),
};

const AGENT = { kind: "agent", name: "L'agent", initials: "IA" } as const;
const FORMER_MEMBER = "Un ancien membre";
const CLIENT_ROLES = ["client", "business"];

function actorOf(row: ActivityRow): ActivityItem["actor"] {
  if (row.actorKind === "agent" || row.actorKind === "runner") return AGENT;
  const name = row.actorName ?? FORMER_MEMBER;
  const kind = row.actorRole !== null && CLIENT_ROLES.includes(row.actorRole) ? "client" : "team";
  return { kind, name, initials: row.actorName === null ? "?" : initialsOf(name) };
}

/** Phrase complète : le sujet, puis l'action ; jamais un identifiant seul, jamais une donnée brute du journal. */
export function activityItemOf(row: ActivityRow): ActivityItem {
  const actor = actorOf(row);
  const phrase = PHRASES[row.action]?.(row.target) ?? "a modifié le projet";
  return { actor, text: `${actor.name} ${phrase}`, at: row.occurredAt.toISOString() };
}
