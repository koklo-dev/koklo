import { describe, expect, it } from "vitest";
import {
  createDependencyGraph,
  type DependencyGraph,
  nextTicket,
  priorityRank,
  rankTickets,
  selectionOrder,
  TICKET_PRIORITIES,
  type Ticket,
} from "../src/index.ts";
import { makeTicket, shuffled, ticketIn } from "./helpers.ts";

const ACTIVE = "sprint-active";
const context = { activeSprint: ACTIVE } as const;

const todo = (key: string, overrides: Record<string, unknown> = {}): Ticket =>
  ticketIn("todo", { key, sprint: ACTIVE, ...overrides });

const dep = (ticket: string, dependsOn: string, type: "blocks" | "related" = "blocks") => ({
  ticket,
  dependsOn,
  type,
});

const keys = (tickets: readonly Ticket[]) => tickets.map((t) => t.key);
const none = createDependencyGraph();

describe("H11 rang de priorité", () => {
  it("dérive de TICKET_PRIORITIES : low=0 ... critical=3", () => {
    expect(TICKET_PRIORITIES.map(priorityRank)).toEqual([0, 1, 2, 3]);
    expect(priorityRank("critical")).toBeGreaterThan(priorityRank("high"));
  });
});

describe("O1 sprint actif d'abord", () => {
  it("un low du sprint actif passe avant un critical hors sprint actif", () => {
    const low = todo("TK-1", { priority: "low" });
    const critical = todo("TK-2", { priority: "critical", sprint: "sprint-autre" });
    expect(keys(selectionOrder([critical, low], none, context))).toEqual(["TK-1", "TK-2"]);
  });

  it("sans sprint (null) et sprint non actif ont le même rang, départagés par les critères suivants", () => {
    const other = todo("TK-1", { priority: "low", sprint: "sprint-autre" });
    const noSprint = todo("TK-2", { priority: "high", sprint: null });
    expect(keys(selectionOrder([other, noSprint], none, context))).toEqual(["TK-2", "TK-1"]);
    const sameLow = todo("TK-3", { priority: "high", sprint: "sprint-autre" });
    expect(keys(selectionOrder([sameLow, noSprint], none, context))).toEqual(["TK-2", "TK-3"]);
  });
});

describe("O2 priorité décroissante", () => {
  it("critical, high, medium, low", () => {
    const tickets = [
      todo("TK-1", { priority: "low" }),
      todo("TK-2", { priority: "medium" }),
      todo("TK-3", { priority: "critical" }),
      todo("TK-4", { priority: "high" }),
    ];
    expect(keys(selectionOrder(tickets, none, context))).toEqual(["TK-3", "TK-4", "TK-2", "TK-1"]);
  });
});

describe("O3 dépendances satisfaites (classement complet)", () => {
  it("à sprint et priorité égaux, le ticket aux dépendances satisfaites précède", () => {
    const blocker = ticketIn("in_progress", { key: "TK-9", sprint: ACTIVE });
    const blocked = todo("TK-1", { createdAt: "2025-01-01T00:00:00.000Z" });
    const free = todo("TK-2", { createdAt: "2026-01-01T00:00:00.000Z" });
    const graph = createDependencyGraph([dep("TK-1", "TK-9")]);
    const ranked = rankTickets([blocked, free, blocker], graph, context);
    expect(keys(ranked).filter((k) => k !== "TK-9")).toEqual(["TK-2", "TK-1"]);
  });

  it("une related non done ne dégrade pas le rang", () => {
    const other = ticketIn("todo", { key: "TK-9", sprint: ACTIVE });
    const a = todo("TK-1", { createdAt: "2025-01-01T00:00:00.000Z" });
    const b = todo("TK-2", { createdAt: "2026-01-01T00:00:00.000Z" });
    const graph = createDependencyGraph([dep("TK-2", "TK-9", "related")]);
    expect(keys(rankTickets([b, a, other], graph, context)).filter((k) => k !== "TK-9")).toEqual([
      "TK-1",
      "TK-2",
    ]);
  });
});

describe("O4 ancienneté", () => {
  it("le plus ancien (createdAt le plus petit) d'abord, comparaison par instant", () => {
    const old = todo("TK-5", { createdAt: "2025-06-01T10:00:00.000Z" });
    const recent = todo("TK-1", { createdAt: "2025-06-01T10:00:01.000Z" });
    const sameInstantOtherFormat = todo("TK-3", { createdAt: "2025-06-01T10:00:00Z" });
    expect(keys(selectionOrder([recent, old], none, context))).toEqual(["TK-5", "TK-1"]);
    expect(keys(selectionOrder([recent, sameInstantOtherFormat], none, context))).toEqual([
      "TK-3",
      "TK-1",
    ]);
  });
});

describe("O5 départage par numéro de clé", () => {
  it("TK-9 avant TK-10 (numérique, pas lexical) et TK-2 avant TK-10 à dates égales", () => {
    const tickets = [todo("TK-10"), todo("TK-9"), todo("TK-100"), todo("TK-2")];
    expect(keys(selectionOrder(tickets, none, context))).toEqual([
      "TK-2",
      "TK-9",
      "TK-10",
      "TK-100",
    ]);
  });
});

describe("O6 précédence des critères", () => {
  it("sprint l'emporte sur priorité", () => {
    const a = todo("TK-1", { priority: "low" });
    const b = todo("TK-2", { priority: "critical", sprint: null });
    expect(keys(selectionOrder([b, a], none, context))[0]).toBe("TK-1");
  });

  it("priorité l'emporte sur satisfaction des dépendances", () => {
    const blocker = ticketIn("in_progress", { key: "TK-9", sprint: ACTIVE, priority: "low" });
    const high = todo("TK-1", { priority: "high" });
    const lowFree = todo("TK-2", { priority: "low" });
    const graph = createDependencyGraph([dep("TK-1", "TK-9")]);
    expect(keys(rankTickets([lowFree, high, blocker], graph, context)).slice(0, 2)).toEqual([
      "TK-1",
      "TK-2",
    ]);
  });

  it("satisfaction l'emporte sur ancienneté", () => {
    const blocker = ticketIn("in_progress", { key: "TK-9", sprint: ACTIVE });
    const olderBlocked = todo("TK-1", { createdAt: "2020-01-01T00:00:00.000Z" });
    const newerFree = todo("TK-2", { createdAt: "2026-01-01T00:00:00.000Z" });
    const graph = createDependencyGraph([dep("TK-1", "TK-9")]);
    const ranked = keys(rankTickets([olderBlocked, newerFree, blocker], graph, context));
    expect(ranked.indexOf("TK-2")).toBeLessThan(ranked.indexOf("TK-1"));
  });

  it("ancienneté l'emporte sur le numéro de clé", () => {
    const olderHighKey = todo("TK-50", { createdAt: "2020-01-01T00:00:00.000Z" });
    const newerLowKey = todo("TK-1", { createdAt: "2026-01-01T00:00:00.000Z" });
    expect(keys(selectionOrder([newerLowKey, olderHighKey], none, context))).toEqual([
      "TK-50",
      "TK-1",
    ]);
  });
});

/** Jeu de 10 tickets exerçant tous les critères, avec dépendances. */
const fixture = () => {
  const tickets: Ticket[] = [
    todo("TK-1", { priority: "critical", createdAt: "2026-01-05T00:00:00.000Z" }),
    todo("TK-2", { priority: "critical", createdAt: "2026-01-01T00:00:00.000Z" }),
    todo("TK-3", { priority: "high", createdAt: "2026-01-01T00:00:00.000Z" }),
    todo("TK-4", { priority: "high", createdAt: "2026-01-01T00:00:00.000Z" }),
    todo("TK-5", { priority: "medium", createdAt: "2025-12-01T00:00:00.000Z" }),
    todo("TK-6", { priority: "low", createdAt: "2025-01-01T00:00:00.000Z" }),
    todo("TK-7", { priority: "critical", sprint: "sprint-autre" }),
    todo("TK-8", { priority: "high", sprint: null }),
    todo("TK-10", { priority: "high", createdAt: "2026-01-01T00:00:00.000Z" }),
    ticketIn("done", { key: "TK-11", sprint: ACTIVE }),
    ticketIn("in_progress", { key: "TK-12", sprint: ACTIVE }),
    ticketIn("backlog", { key: "TK-13", sprint: ACTIVE }),
  ];
  const edges = [
    dep("TK-3", "TK-11"),
    dep("TK-4", "TK-12"),
    dep("TK-5", "TK-11"),
    dep("TK-6", "TK-2", "related"),
    dep("TK-10", "TK-77"),
  ];
  return { tickets, edges };
};

const graphFrom = (edges: ReturnType<typeof dep>[]): DependencyGraph =>
  createDependencyGraph(edges);

describe("O7 indépendance de l'ordre d'insertion", () => {
  const { tickets, edges } = fixture();
  const reference = selectionOrder(tickets, graphFrom(edges), context);

  it("le résultat de référence est celui attendu (ordre explicite)", () => {
    expect(keys(reference)).toEqual([
      "TK-2", // critical, sprint actif, plus ancien
      "TK-1", // critical, sprint actif
      "TK-3", // high, satisfait (TK-11 done)
      "TK-5", // medium
      "TK-6", // low
      "TK-7", // hors sprint actif
      "TK-8", // sans sprint
    ]);
  });

  it("ordre inverse des tickets", () => {
    expect(keys(selectionOrder([...tickets].reverse(), graphFrom(edges), context))).toEqual(
      keys(reference),
    );
  });

  it("22 permutations pseudo-aléatoires à graine fixe (tickets et arêtes)", () => {
    for (let seed = 1; seed <= 22; seed++) {
      const order = selectionOrder(
        shuffled(tickets, seed),
        graphFrom(shuffled(edges, seed * 7919)),
        context,
      );
      expect(keys(order)).toEqual(keys(reference));
      expect(
        nextTicket(shuffled(tickets, seed), graphFrom(shuffled(edges, seed + 100)), context)?.key,
      ).toBe("TK-2");
    }
  });

  it("rankTickets (classement complet) est aussi indépendant de l'ordre", () => {
    const ranked = keys(rankTickets(tickets, graphFrom(edges), context));
    for (let seed = 1; seed <= 20; seed++) {
      expect(
        keys(rankTickets(shuffled(tickets, seed), graphFrom(shuffled(edges, seed)), context)),
      ).toEqual(ranked);
    }
    expect(ranked).toHaveLength(tickets.length);
  });
});

describe("O8 inéligibles et nextTicket", () => {
  it("selectionOrder exclut les inéligibles ; rankTickets les conserve", () => {
    const { tickets, edges } = fixture();
    const queue = keys(selectionOrder(tickets, graphFrom(edges), context));
    for (const excluded of ["TK-4", "TK-10", "TK-11", "TK-12", "TK-13"]) {
      expect(queue).not.toContain(excluded);
    }
    expect(keys(rankTickets(tickets, graphFrom(edges), context))).toContain("TK-4");
  });

  it("nextTicket renvoie null : ensemble vide, que des done, que des bloqués", () => {
    expect(nextTicket([], none, context)).toBeNull();
    expect(
      nextTicket([ticketIn("done", { key: "TK-1", sprint: ACTIVE })], none, context),
    ).toBeNull();
    const blocker = ticketIn("in_progress", { key: "TK-2", sprint: ACTIVE });
    const blocked = todo("TK-1");
    expect(
      nextTicket([blocked, blocker], createDependencyGraph([dep("TK-1", "TK-2")]), context),
    ).toBeNull();
  });

  it("nextTicket renvoie le premier de selectionOrder appartenant au sprint actif", () => {
    const { tickets, edges } = fixture();
    expect(nextTicket(tickets, graphFrom(edges), context)?.key).toBe("TK-2");
  });

  it("nextTicket ne propose jamais un ticket hors sprint actif (§7.3)", () => {
    const outside = todo("TK-1", { priority: "critical", sprint: "sprint-autre" });
    const noSprint = todo("TK-2", { sprint: null });
    expect(nextTicket([outside, noSprint], none, context)).toBeNull();
  });

  it("H8 sans sprint actif (null) : file de livraison vide", () => {
    const a = todo("TK-1");
    const noSprint = todo("TK-2", { sprint: null });
    expect(nextTicket([a, noSprint], none, { activeSprint: null })).toBeNull();
  });
});

describe("O9 pureté", () => {
  it("ne mute ni le tableau d'entrée ni les tickets, et deux appels donnent le même résultat", () => {
    const { tickets, edges } = fixture();
    const input = shuffled(tickets, 3);
    const copy = [...input];
    const graph = graphFrom(edges);
    const first = selectionOrder(input, graph, context);
    const second = selectionOrder(input, graph, context);
    expect(input).toEqual(copy);
    input.forEach((ticket, index) => {
      expect(ticket).toBe(copy[index]);
    });
    expect(keys(first)).toEqual(keys(second));
    expect(first).not.toBe(input);
    const ranked = rankTickets(input, graph, context);
    expect(input).toEqual(copy);
    expect(ranked).not.toBe(input);
  });
});

describe("O10 aucune horloge", () => {
  it("le résultat ne dépend pas de la date du jour", () => {
    const { tickets, edges } = fixture();
    const before = keys(selectionOrder(tickets, graphFrom(edges), context));
    const realNow = Date.now;
    try {
      Date.now = () => new Date("2099-01-01T00:00:00Z").getTime();
      expect(keys(selectionOrder(tickets, graphFrom(edges), context))).toEqual(before);
    } finally {
      Date.now = realNow;
    }
  });

  it("le ticket makeTicket par défaut est utilisable (createdAt fourni par les helpers)", () => {
    expect(makeTicket().createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
