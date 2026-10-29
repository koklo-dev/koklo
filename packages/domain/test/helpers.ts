import { createTicket, type Ticket, type TicketStatus } from "../src/index.ts";

export const baseInput = {
  key: "TK-1",
  title: "Domaine : ticket",
  type: "feature",
  priority: "medium",
  pkg: "domain",
  sensitivity: "safe",
  createdAt: "2026-01-01T00:00:00.000Z",
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

/** Générateur pseudo-aléatoire déterministe (mulberry32) : jamais Math.random. */
export const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Mélange de Fisher-Yates sur une copie, graine fixe. */
export const shuffled = <T>(items: readonly T[], seed: number): T[] => {
  const random = seededRandom(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
};

export const byKey = (tickets: readonly Ticket[]): ReadonlyMap<string, Ticket> =>
  new Map(tickets.map((ticket) => [ticket.key, ticket]));
