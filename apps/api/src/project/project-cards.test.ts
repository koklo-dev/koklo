import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type CardFacts,
  cardOf,
  pageOfCards,
  progressOf,
} from "./project-cards.ts";

/** TK-93 lot A (cas 1, 2) : cartes, tri, curseur stable, facettes et attention, fonctions pures. */
const NOW = new Date("2026-11-09T10:00:00.000Z");
const CTX: CardContext = { role: "dev", audience: "team", now: NOW, aiConfigured: true };

const page = (status: "empty" | "draft" | "review" | "stable", required = false) => ({
  title: "Page",
  status,
  required,
});
const STABLE_PAGES = Array.from({ length: 10 }, (_, i) => page("stable", i < 4));

function facts(id: string, name: string, over: Partial<CardFacts> = {}): CardFacts {
  return {
    project: { id, name, createdAt: new Date("2026-01-01T00:00:00.000Z") },
    phaseFacts: { featureCount: 0, validatedBaselines: 0, ideaVersions: 0 },
    pages: STABLE_PAGES,
    clients: [],
    staff: [],
    spec: { failed: false, head: null, verdicts: [] },
    sprint: null,
    pendingProposals: 0,
    proposalAuthor: null,
    activity: null,
    creation: null,
    ...over,
  };
}
const FRAMING = { featureCount: 0, validatedBaselines: 0, ideaVersions: 1 };
const ITERATIONS = { featureCount: 3, validatedBaselines: 1, ideaVersions: 1 };
const idsOf = (page: { items: { id: string }[] }) => page.items.map((item) => item.id);

describe("TK-93 progressOf : avancement par phase", () => {
  it("idée : pages stables sur le total, singulier compris", () => {
    const one = [page("stable"), ...Array.from({ length: 9 }, () => page("empty"))];
    expect(progressOf("idea", one, 0, null)).toEqual({
      label: "Dossier d'idée",
      done: 1,
      total: 10,
      valueLabel: "1 page stable sur 10",
    });
    expect(progressOf("idea", STABLE_PAGES, 0, null).valueLabel).toBe("10 pages stables sur 10");
  });

  it("cadrage : livrables validés sur 7", () => {
    expect(progressOf("framing", [], 0, null)).toEqual({
      label: "Livrables validés",
      done: 0,
      total: 7,
      valueLabel: "0 sur 7",
    });
  });

  it("itérations : sprint actif et tickets terminés ; sans sprint, un texte neutre", () => {
    const sprint = { key: "SP-7", tickets: [{ status: "done" }, { status: "todo" }] };
    expect(progressOf("iterations", [], 0, sprint as never)).toMatchObject({
      label: "Sprint SP-7",
      done: 1,
      total: 2,
      valueLabel: "1 ticket sur 2",
    });
    expect(progressOf("iterations", [], 0, null)).toMatchObject({
      label: "Sprint",
      done: 0,
      total: 0,
      valueLabel: "Aucun sprint actif",
    });
  });
});

describe("TK-93 cardOf : une carte", () => {
  it("phase, tuile, personnes (client d'abord, trois au plus), contact et activité", () => {
    const { card } = cardOf(
      facts("p1", "Refonte du portail", {
        phaseFacts: FRAMING,
        clients: [{ name: "Marie Lefèvre", role: "client" }],
        staff: [
          { name: "Awa Koné", role: "admin" },
          { name: "Moussa Diop", role: "dev" },
          { name: "Zoé Martin", role: "designer" },
        ],
        activity: { actor: "Awa Koné", at: new Date("2026-11-09T08:00:00.000Z") },
      }),
      CTX,
    );
    expect(card).toMatchObject({
      id: "p1",
      initials: "RD",
      phase: "framing",
      clientContact: "Marie Lefèvre",
      lastActivity: { actor: "Awa Koné", at: "2026-11-09T08:00:00.000Z" },
      creation: null,
    });
    expect(card.colorKey).toBeGreaterThanOrEqual(1);
    expect(card.people.map((p) => [p.initials, p.client])).toEqual([
      ["ML", true],
      ["AK", false],
      ["MD", false],
    ]);
  });

  it("prochaine étape : une règle d'avertissement demande l'attention, « rien à faire » non", () => {
    const fresh = facts("a", "A", { pages: [page("empty"), page("empty")] });
    expect(cardOf(fresh, CTX).attention).toBe(true);
    expect(cardOf(fresh, CTX).card.nextAction?.attention).toBe(true);
    const calm = cardOf(facts("b", "B"), CTX);
    expect(calm.attention).toBe(false);
    expect(calm.card.nextAction).toMatchObject({ attention: false });
  });

  it("le client ne reçoit ni contact d'équipe ni libellé d'équipe", () => {
    const { card } = cardOf(
      facts("c", "C", { clients: [{ name: "Marie Lefèvre", role: "client" }] }),
      { ...CTX, role: "client", audience: "client" },
    );
    expect(card.clientContact).toBeNull();
    expect(card.nextAction?.title).toBe("Rien n'attend votre action.");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même fonction, un test par cas
describe("TK-93 pageOfCards : filtre, tri, facettes, curseur", () => {
  const list = [
    facts("a", "Alpha", { activity: { actor: "X", at: new Date("2026-11-01T00:00:00.000Z") } }),
    facts("b", "bravo", {
      phaseFacts: FRAMING,
      activity: { actor: "X", at: new Date("2026-11-05T00:00:00.000Z") },
    }),
    facts("c", "Charlie", { phaseFacts: ITERATIONS }),
    facts("d", "Delta", { pages: [page("empty")] }),
    facts("e", "Écho", {
      activity: { actor: "Y", at: new Date("2026-11-03T00:00:00.000Z") },
    }),
  ];
  const run = (query: Parameters<typeof pageOfCards>[2] = {}, ctx = CTX) =>
    pageOfCards(list, ctx, query);

  it("facettes de phase et total sur les projets visibles ; attention compte les avertissements", () => {
    const out = run();
    expect(out.facets).toEqual({ all: 5, idea: 3, framing: 1, iterations: 1 });
    expect(out.total).toBe(5);
    expect(out.attention).toBe(1);
    expect(out.audience).toBe("team");
  });

  it("tri activité : du plus récent au plus ancien, sans activité à la date de création", () => {
    expect(idsOf(run({ sort: "activity" }))).toEqual(["b", "e", "a", "c", "d"]);
  });

  it("tri par nom : alphabétique sans tenir compte de la casse ni des accents", () => {
    expect(idsOf(run({ sort: "name" }))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("tri attention : les cartes qui demandent une action d'abord", () => {
    expect(idsOf(run({ sort: "attention" }))[0]).toBe("d");
  });

  it("recherche : nom sans casse ni accents ; les facettes suivent la recherche, pas la phase", () => {
    const out = run({ q: "ECHO", phase: "idea" });
    expect(idsOf(out)).toEqual(["e"]);
    expect(out.total).toBe(1);
    expect(out.facets).toEqual({ all: 1, idea: 1, framing: 0, iterations: 0 });
  });

  it("filtre de phase : total filtré, facettes et attention indépendants du filtre", () => {
    const out = run({ phase: "framing" });
    expect(idsOf(out)).toEqual(["b"]);
    expect(out.total).toBe(1);
    expect(out.facets.all).toBe(5);
    expect(out.attention).toBe(1);
  });

  it("curseur : deux pages sans doublon ni trou, stable si un projet est inséré entre-temps", () => {
    const first = run({ sort: "name", limit: 2 });
    expect(idsOf(first)).toEqual(["a", "b"]);
    expect(first.nextCursor).not.toBeNull();
    const inserted = [...list, facts("aa", "Aaa")];
    const second = pageOfCards(inserted, CTX, {
      sort: "name",
      limit: 2,
      cursor: first.nextCursor as string,
    });
    expect(idsOf(second)).toEqual(["c", "d"]);
    const last = pageOfCards(inserted, CTX, {
      sort: "name",
      limit: 2,
      cursor: second.nextCursor as string,
    });
    expect(idsOf(last)).toEqual(["e"]);
    expect(last.nextCursor).toBeNull();
  });

  it("limite : 24 par défaut et au plus", () => {
    const many = Array.from({ length: 30 }, (_, i) => facts(`p${i}`, `Projet ${i}`));
    expect(pageOfCards(many, CTX, {}).items).toHaveLength(24);
    expect(pageOfCards(many, CTX, { limit: 99 }).items).toHaveLength(24);
  });

  it("curseur d'un autre tri ou illisible : refusé (VALIDATION)", () => {
    const first = run({ sort: "name", limit: 1 });
    expect(() => run({ sort: "activity", cursor: first.nextCursor as string })).toThrow();
    expect(() => run({ cursor: "n'importe quoi" })).toThrow();
  });

  it("audience client : reprise dans la réponse", () => {
    expect(run({}, { ...CTX, role: "client", audience: "client" }).audience).toBe("client");
  });
});
