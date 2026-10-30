import type { TicketOutput, TicketStatus } from "@koklo/contract";
import type { FocusRequest } from "../lib/use-ticket-move.ts";

/** Ce que le tableau sait faire des tickets : état partagé par la vue, les colonnes et les cartes. */
export interface KanbanInteraction {
  /** Faux en lecture seule (client, business, rôle encore inconnu) : ni bouton ni glisser. */
  canMove: boolean;
  /** Clés des tickets dont le déplacement est en cours. */
  moving: readonly string[];
  /** Statut de départ du ticket saisi au glisser, sinon null. */
  dragFrom: TicketStatus | null;
  dragKey: string | null;
  focus: FocusRequest | null;
  onMove: (ticket: TicketOutput, to: TicketStatus) => void;
  onDragStart: (key: string) => void;
  onDragEnd: () => void;
  onDrop: (to: TicketStatus, transferredKey: string) => void;
}
