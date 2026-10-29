import { describe, expect, it } from "vitest";
import {
  canTransition,
  InvalidTicketStatusError,
  InvalidTicketTransitionError,
  isTicketStatus,
  TICKET_STATUSES,
  type TicketStatus,
  transitionTicket,
} from "../src/index.ts";
import { makeTicket, ticketIn } from "./helpers.ts";

type Pair = readonly [id: string, from: TicketStatus, to: TicketStatus];

const ALLOWED: readonly Pair[] = [
  ["T01", "backlog", "todo"],
  ["T02", "backlog", "cancelled"],
  ["T03", "todo", "in_progress"],
  ["T04", "todo", "backlog"],
  ["T05", "todo", "blocked"],
  ["T06", "todo", "cancelled"],
  ["T07", "in_progress", "in_review"],
  ["T08", "in_progress", "blocked"],
  ["T09", "in_progress", "todo"],
  ["T10", "in_progress", "cancelled"],
  ["T11", "in_review", "done"],
  ["T12", "in_review", "in_progress"],
  ["T13", "in_review", "blocked"],
  ["T14", "in_review", "cancelled"],
  ["T15", "blocked", "todo"],
  ["T16", "blocked", "backlog"],
  ["T17", "blocked", "cancelled"],
];

const REFUSED: readonly (readonly [TicketStatus, TicketStatus])[] = [
  // auto-transitions (7)
  ["backlog", "backlog"],
  ["todo", "todo"],
  ["in_progress", "in_progress"],
  ["in_review", "in_review"],
  ["blocked", "blocked"],
  ["done", "done"],
  ["cancelled", "cancelled"],
  // terminaux (12)
  ["done", "backlog"],
  ["done", "todo"],
  ["done", "in_progress"],
  ["done", "in_review"],
  ["done", "blocked"],
  ["done", "cancelled"],
  ["cancelled", "backlog"],
  ["cancelled", "todo"],
  ["cancelled", "in_progress"],
  ["cancelled", "in_review"],
  ["cancelled", "blocked"],
  ["cancelled", "done"],
  // sauts interdits (13)
  ["backlog", "in_progress"],
  ["backlog", "in_review"],
  ["backlog", "blocked"],
  ["backlog", "done"],
  ["todo", "in_review"],
  ["todo", "done"],
  ["in_progress", "backlog"],
  ["in_progress", "done"],
  ["in_review", "backlog"],
  ["in_review", "todo"],
  ["blocked", "in_progress"],
  ["blocked", "in_review"],
  ["blocked", "done"],
];

describe("CA1.d statuts (liste fermée)", () => {
  it("expose exactement les 7 statuts, dans l'ordre stable", () => {
    expect([...TICKET_STATUSES]).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "blocked",
      "done",
      "cancelled",
    ]);
  });

  it("isTicketStatus accepte les statuts et refuse le reste (CA1.a)", () => {
    for (const status of TICKET_STATUSES) expect(isTicketStatus(status)).toBe(true);
    for (const bad of ["review", "", "BACKLOG", undefined, null, 3, {}]) {
      expect(isTicketStatus(bad)).toBe(false);
    }
  });
});

describe("table exhaustive", () => {
  it("compte 17 autorisés et 32 refusés, soit les 49 couples sans doublon ni oubli", () => {
    expect(ALLOWED).toHaveLength(17);
    expect(REFUSED).toHaveLength(32);
    const decided = [
      ...ALLOWED.map(([, f, t]) => `${f}>${t}`),
      ...REFUSED.map(([f, t]) => `${f}>${t}`),
    ];
    const product = TICKET_STATUSES.flatMap((f) => TICKET_STATUSES.map((t) => `${f}>${t}`));
    expect(new Set(decided).size).toBe(decided.length);
    expect([...decided].sort()).toEqual([...product].sort());
  });
});

describe("transitions autorisées", () => {
  it.each(ALLOWED)("%s : %s -> %s est autorisée", (_id, from, to) => {
    const ticket = ticketIn(from);
    const next = transitionTicket(ticket, to);
    expect(next.status).toBe(to);
    expect(canTransition(from, to)).toBe(true);
  });
});

describe("transitions refusées", () => {
  it.each(REFUSED)("refuse %s -> %s avec InvalidTicketTransitionError(from, to)", (from, to) => {
    const ticket = ticketIn(from);
    let caught: unknown;
    try {
      transitionTicket(ticket, to);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidTicketTransitionError);
    expect(caught).toMatchObject({ from, to });
    expect(ticket.status).toBe(from);
    expect(canTransition(from, to)).toBe(false);
  });
});

describe("cohérence et immutabilité", () => {
  it("CA1.b canTransition et transitionTicket donnent le même verdict pour les 49 couples", () => {
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_STATUSES) {
        let ok = true;
        try {
          transitionTicket(ticketIn(from), to);
        } catch {
          ok = false;
        }
        expect(ok).toBe(canTransition(from, to));
      }
    }
  });

  it("CA1.c ne modifie pas l'entrée et conserve clé, pkg et sensibilité", () => {
    const ticket = makeTicket({ sensitivity: "sensitive", pkg: "api" });
    const next = transitionTicket(ticket, "todo");
    expect(next).not.toBe(ticket);
    expect(ticket.status).toBe("backlog");
    expect(next).toMatchObject({ key: ticket.key, pkg: "api", sensitivity: "sensitive" });
    expect(Object.isFrozen(next)).toBe(true);
  });

  it("CA1.a refuse un statut cible hors liste (erreur InvalidTicketStatusError)", () => {
    for (const bad of ["review", "", undefined]) {
      expect(() => transitionTicket(makeTicket(), bad as never)).toThrow(InvalidTicketStatusError);
    }
    expect(canTransition("review" as never, "todo")).toBe(false);
    expect(canTransition("todo", undefined as never)).toBe(false);
  });
});
