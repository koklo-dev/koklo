import { createTicket, type Ticket, type TicketStatus } from "../src/index.ts";

export const baseInput = {
  key: "TK-1",
  title: "Domaine : ticket",
  type: "feature",
  priority: "medium",
  pkg: "domain",
  sensitivity: "safe",
} as const;

export const makeTicket = (overrides: Record<string, unknown> = {}): Ticket =>
  createTicket({ ...baseInput, ...overrides } as Parameters<typeof createTicket>[0]);

/** Ticket dans un statut donné, sans passer par la table de transitions. */
export const ticketIn = (
  status: TicketStatus,
  overrides: Record<string, unknown> = {},
): Ticket => ({
  ...makeTicket(overrides),
  status,
});
