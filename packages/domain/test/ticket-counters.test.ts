import { describe, expect, it } from "vitest";
import {
  CounterLimitReachedError,
  escalate,
  InvalidTicketError,
  recordAttempt,
  recordReviewRound,
  transitionTicket,
} from "../src/index.ts";
import { makeTicket, ticketIn } from "./helpers.ts";

describe("C1 ticket neuf", () => {
  it("démarre à 0 tentative et 0 round de revue", () => {
    expect(makeTicket()).toMatchObject({ attempts: 0, reviewRounds: 0 });
  });
});

describe("C2 incréments plafonnés", () => {
  it("recordAttempt incrémente de 1 sans toucher reviewRounds", () => {
    const next = recordAttempt(makeTicket(), { max: 3 });
    expect(next).toMatchObject({ attempts: 1, reviewRounds: 0 });
  });
  it("recordReviewRound incrémente de 1 sans toucher attempts", () => {
    const next = recordReviewRound(makeTicket({ attempts: 2 }), { max: 3 });
    expect(next).toMatchObject({ attempts: 2, reviewRounds: 1 });
  });
  it("accepte d'atteindre le plafond puis le refuse au-delà", () => {
    const atMax = recordAttempt(makeTicket({ attempts: 2 }), { max: 3 });
    expect(atMax.attempts).toBe(3);
    const ticket = makeTicket({ attempts: 3 });
    expect(() => recordAttempt(ticket, { max: 3 })).toThrow(CounterLimitReachedError);
    expect(() => recordAttempt(ticket, { max: 3 })).toThrow(
      expect.objectContaining({ counter: "attempts", max: 3 }),
    );
    expect(ticket.attempts).toBe(3);
  });
  it("plafond de revue indépendant", () => {
    const ticket = makeTicket({ reviewRounds: 2, attempts: 0 });
    expect(() => recordReviewRound(ticket, { max: 2 })).toThrow(
      expect.objectContaining({ counter: "reviewRounds", max: 2 }),
    );
    expect(recordAttempt(ticket, { max: 1 }).attempts).toBe(1);
  });
  it("refuse un plafond invalide", () => {
    for (const max of [-1, 1.5, Number.NaN]) {
      expect(() => recordAttempt(makeTicket(), { max })).toThrow(InvalidTicketError);
    }
  });
  it("renvoie un ticket gelé distinct de l'entrée", () => {
    const ticket = makeTicket();
    const next = recordAttempt(ticket, { max: 3 });
    expect(next).not.toBe(ticket);
    expect(Object.isFrozen(next)).toBe(true);
    expect(ticket.attempts).toBe(0);
  });
});

describe("C3 incident-07-counters-reset-on-escalation", () => {
  it("incident-07-counters-reset-on-escalation : escalate remet attempts ET reviewRounds à 0", () => {
    const stuck = ticketIn("in_progress", { attempts: 3, reviewRounds: 2 });
    const escalated = escalate(stuck);
    expect(escalated).toMatchObject({ attempts: 0, reviewRounds: 0, status: "blocked" });
    expect(stuck).toMatchObject({ attempts: 3, reviewRounds: 2, status: "in_progress" });
  });
  it("un ticket re-pris après escalade n'est pas ré-escaladé immédiatement", () => {
    const escalated = escalate(ticketIn("in_progress", { attempts: 3, reviewRounds: 2 }));
    const resumed = transitionTicket(transitionTicket(escalated, "todo"), "in_progress");
    expect(recordAttempt(resumed, { max: 3 }).attempts).toBe(1);
    expect(recordReviewRound(resumed, { max: 2 }).reviewRounds).toBe(1);
  });
  it("depuis un statut sans transition vers blocked, ne change que les compteurs", () => {
    const backlog = escalate(ticketIn("backlog", { attempts: 1, reviewRounds: 1 }));
    expect(backlog).toMatchObject({ status: "backlog", attempts: 0, reviewRounds: 0 });
    const done = escalate(ticketIn("done", { attempts: 1 }));
    expect(done.status).toBe("done");
  });
});

describe("C4 incident-08-review-budget-persists-across-resume", () => {
  it("incident-08-review-budget-persists-across-resume : seule l'escalade remet à zéro", () => {
    let ticket = ticketIn("in_progress");
    for (let round = 1; round <= 3; round += 1) {
      ticket = transitionTicket(ticket, "in_review");
      ticket = recordReviewRound(ticket, { max: 5 });
      ticket = transitionTicket(ticket, "in_progress");
      expect(ticket.reviewRounds).toBe(round);
    }
    expect(escalate(ticket).reviewRounds).toBe(0);
  });
});

describe("C5 compteurs invalides à la création", () => {
  const bad = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "2"];
  it.each(bad.map((v) => [String(v), v] as const))("refuse attempts = %s", (_l, v) => {
    expect(() => makeTicket({ attempts: v })).toThrow(
      expect.objectContaining({ field: "attempts" }),
    );
  });
  it.each(bad.map((v) => [String(v), v] as const))("refuse reviewRounds = %s", (_l, v) => {
    expect(() => makeTicket({ reviewRounds: v })).toThrow(
      expect.objectContaining({ field: "reviewRounds" }),
    );
  });
});
