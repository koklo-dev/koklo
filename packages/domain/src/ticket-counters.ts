import { CounterLimitReachedError, InvalidTicketError, type TicketCounterName } from "./errors.ts";
import { type Ticket, withTicketChanges } from "./ticket.ts";
import { canTransition } from "./ticket-transitions.ts";

export type CounterLimit = { readonly max: number };

const increment = (ticket: Ticket, counter: TicketCounterName, { max }: CounterLimit): Ticket => {
  if (!Number.isInteger(max) || max < 0) {
    throw new InvalidTicketError("max", "entier >= 0 attendu");
  }
  if (ticket[counter] + 1 > max) throw new CounterLimitReachedError(counter, max);
  return withTicketChanges(ticket, { [counter]: ticket[counter] + 1 });
};

export const recordAttempt = (ticket: Ticket, limit: CounterLimit): Ticket =>
  increment(ticket, "attempts", limit);

export const recordReviewRound = (ticket: Ticket, limit: CounterLimit): Ticket =>
  increment(ticket, "reviewRounds", limit);

/** Incidents 7 et 8 : seule l'escalade remet les compteurs à zéro. */
export const escalate = (ticket: Ticket): Ticket =>
  withTicketChanges(ticket, {
    attempts: 0,
    reviewRounds: 0,
    ...(canTransition(ticket.status, "blocked") ? { status: "blocked" as const } : {}),
  });
