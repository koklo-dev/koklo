import { describe, expect, it } from "vitest";
import {
  areDependenciesSatisfied,
  createDependencyGraph,
  isEligible,
  TICKET_STATUSES,
  type TicketStatus,
} from "../src/index.ts";
import { byKey, makeTicket, ticketIn } from "./helpers.ts";

const dep = (ticket: string, dependsOn: string, type: "blocks" | "related" = "blocks") => ({
  ticket,
  dependsOn,
  type,
});

describe("E1 sans dépendance", () => {
  it("un ticket todo sans dépendance est éligible", () => {
    const a = ticketIn("todo", { key: "TK-1" });
    expect(isEligible(a, createDependencyGraph(), byKey([a]))).toBe(true);
  });
});

describe("E2 une dépendance done", () => {
  it("est éligible", () => {
    const a = ticketIn("todo", { key: "TK-1" });
    const b = ticketIn("done", { key: "TK-2" });
    const graph = createDependencyGraph([dep("TK-1", "TK-2")]);
    expect(isEligible(a, graph, byKey([a, b]))).toBe(true);
  });
});

describe("E3 toutes les dépendances bloquantes", () => {
  it("done + in_review : non éligible", () => {
    const a = ticketIn("todo", { key: "TK-1" });
    const b = ticketIn("done", { key: "TK-2" });
    const c = ticketIn("in_review", { key: "TK-3" });
    const graph = createDependencyGraph([dep("TK-1", "TK-2"), dep("TK-1", "TK-3")]);
    expect(isEligible(a, graph, byKey([a, b, c]))).toBe(false);
  });
});

describe("E4 chacun des 7 statuts pour une dépendance blocks", () => {
  it.each(TICKET_STATUSES.map((status) => [status] as [TicketStatus]))(
    "dépendance en %s : éligible ssi done (cancelled ne satisfait pas, H5)",
    (status) => {
      const a = ticketIn("todo", { key: "TK-1" });
      const b = ticketIn(status, { key: "TK-2" });
      const graph = createDependencyGraph([dep("TK-1", "TK-2")]);
      expect(isEligible(a, graph, byKey([a, b]))).toBe(status === "done");
      expect(areDependenciesSatisfied(a, graph, byKey([a, b]))).toBe(status === "done");
    },
  );
});

describe("E5 dépendance related", () => {
  it("ne bloque pas, quel que soit le statut de la cible", () => {
    for (const status of TICKET_STATUSES) {
      const a = ticketIn("todo", { key: "TK-1" });
      const b = ticketIn(status, { key: "TK-2" });
      const graph = createDependencyGraph([dep("TK-1", "TK-2", "related")]);
      expect(isEligible(a, graph, byKey([a, b]))).toBe(true);
    }
  });

  it("une related inconnue ne bloque pas non plus", () => {
    const a = ticketIn("todo", { key: "TK-1" });
    const graph = createDependencyGraph([dep("TK-1", "TK-77", "related")]);
    expect(isEligible(a, graph, byKey([a]))).toBe(true);
  });
});

describe("E6 dépendance vers une clé absente (fail-closed, H7)", () => {
  it("n'est pas éligible et ne lève aucune exception", () => {
    const a = ticketIn("todo", { key: "TK-1" });
    const graph = createDependencyGraph([dep("TK-1", "TK-77")]);
    expect(() => isEligible(a, graph, byKey([a]))).not.toThrow();
    expect(isEligible(a, graph, byKey([a]))).toBe(false);
    expect(areDependenciesSatisfied(a, graph, byKey([a]))).toBe(false);
  });
});

describe("E7 seul todo est éligible", () => {
  it.each(TICKET_STATUSES.map((status) => [status] as [TicketStatus]))(
    "ticket en %s sans dépendance : éligible ssi todo",
    (status) => {
      const a = ticketIn(status, { key: "TK-1" });
      expect(isEligible(a, createDependencyGraph(), byKey([a]))).toBe(status === "todo");
    },
  );

  it("un ticket non todo dont les dépendances sont satisfaites reste satisfait mais inéligible", () => {
    const a = ticketIn("backlog", { key: "TK-1" });
    expect(areDependenciesSatisfied(a, createDependencyGraph(), byKey([a]))).toBe(true);
    expect(isEligible(a, createDependencyGraph(), byKey([a]))).toBe(false);
  });
});

describe("E8 seule la dépendance directe compte", () => {
  it("A->B->C, C done, B todo : A non éligible ; B éligible", () => {
    const a = ticketIn("todo", { key: "TK-1" });
    const b = ticketIn("todo", { key: "TK-2" });
    const c = ticketIn("done", { key: "TK-3" });
    const graph = createDependencyGraph([dep("TK-1", "TK-2"), dep("TK-2", "TK-3")]);
    const all = byKey([a, b, c]);
    expect(isEligible(a, graph, all)).toBe(false);
    expect(isEligible(b, graph, all)).toBe(true);
  });

  it("est pure : les entrées ne changent pas", () => {
    const a = makeTicket({ key: "TK-1", status: "todo" });
    const tickets = byKey([a]);
    isEligible(a, createDependencyGraph(), tickets);
    expect(tickets.size).toBe(1);
    expect(Object.isFrozen(a)).toBe(true);
  });
});
