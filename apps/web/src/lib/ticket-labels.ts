import type { TicketOutput, TicketStatus } from "@koklo/contract";
import type { IconName } from "@koklo/ui";

/** Priorité d'un ticket, telle que l'API la sert. */
export type TicketPriority = TicketOutput["priority"];

/** Les 7 statuts dans l'ordre du cycle de vie : l'ordre des colonnes du kanban. */
export const STATUS_ORDER: readonly TicketStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: "Backlog",
  todo: "À faire",
  in_progress: "En cours",
  in_review: "En revue",
  blocked: "Bloqué",
  done: "Terminé",
  cancelled: "Annulé",
};

/** Une icône distincte par statut : le statut n'est jamais porté par la couleur seule. */
export const STATUS_ICONS: Record<TicketStatus, IconName> = {
  backlog: "inbox",
  todo: "radio_button_unchecked",
  in_progress: "play_circle",
  in_review: "fact_check",
  blocked: "block",
  done: "check_circle",
  cancelled: "cancel",
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Priorité basse",
  medium: "Priorité moyenne",
  high: "Priorité haute",
  critical: "Priorité critique",
};

export function isStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (STATUS_ORDER as readonly string[]).includes(value);
}
