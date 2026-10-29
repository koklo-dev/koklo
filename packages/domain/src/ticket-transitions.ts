import { InvalidTicketStatusError, InvalidTicketTransitionError } from "./errors.ts";
import { type Ticket, withTicketChanges } from "./ticket.ts";
import { isTicketStatus, type TicketStatus } from "./ticket-status.ts";

/** Table H1 : done et cancelled sont terminaux ; blocked ne reprend jamais en in_progress. */
const TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  backlog: ["todo", "cancelled"],
  todo: ["in_progress", "backlog", "blocked", "cancelled"],
  in_progress: ["in_review", "blocked", "todo", "cancelled"],
  in_review: ["done", "in_progress", "blocked", "cancelled"],
  blocked: ["todo", "backlog", "cancelled"],
  done: [],
  cancelled: [],
};

export const canTransition = (from: unknown, to: unknown): boolean =>
  isTicketStatus(from) && isTicketStatus(to) && TRANSITIONS[from].includes(to);

export const transitionTicket = (ticket: Ticket, to: unknown): Ticket => {
  if (!isTicketStatus(to)) throw new InvalidTicketStatusError(to);
  if (!canTransition(ticket.status, to)) throw new InvalidTicketTransitionError(ticket.status, to);
  return withTicketChanges(ticket, { status: to });
};
