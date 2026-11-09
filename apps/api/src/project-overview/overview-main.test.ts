import { describe, expect, it } from "vitest";
import {
  type IdeaPageFact,
  ideaPagesOf,
  peopleOf,
  sprintTicketsOf,
  type TicketFact,
} from "./overview-main.ts";

const page = (position: number, over: Partial<IdeaPageFact> = {}): IdeaPageFact => ({
  position,
  title: `Page ${position}`,
  status: "draft",
  required: false,
  pendingProposals: 0,
  updatedAt: new Date(2026, 10, 1, position),
  ...over,
});

describe("ideaPagesOf : 5 pages triées (propositions, requises non stables, récentes)", () => {
  it("trie, borne à 5 et garde l'ordre de position à égalité de rang", () => {
    const pages = [
      page(0, { status: "stable", required: true }),
      page(1),
      page(2, { required: true }),
      page(3, { pendingProposals: 2 }),
      page(4, { updatedAt: new Date(2026, 10, 8) }),
      page(5),
      page(6, { required: true, pendingProposals: 1 }),
    ];
    expect(ideaPagesOf(pages).map((entry) => entry.position)).toEqual([6, 3, 2, 4, 5]);
  });

  it("notes lisibles, statut de la page conservé", () => {
    const [first, second, third] = ideaPagesOf([
      page(1, { pendingProposals: 2 }),
      page(2, { status: "empty", required: true }),
      page(3, { status: "stable" }),
    ]);
    expect(first).toEqual({
      position: 1,
      title: "Page 1",
      note: "2 propositions de l'agent",
      status: "draft",
    });
    expect(second).toMatchObject({ note: "Page requise, encore vide", status: "empty" });
    expect(third).toMatchObject({ note: "Stable", status: "stable" });
    expect(ideaPagesOf([page(1, { pendingProposals: 1 })])[0]?.note).toBe(
      "1 proposition de l'agent",
    );
  });
});

const ticket = (n: number, status: TicketFact["status"], day = n): TicketFact => ({
  key: `TK-${n}`,
  title: `Ticket ${n}`,
  status,
  updatedAt: new Date(2026, 10, day),
});

describe("sprintTicketsOf : 5 tickets (en revue, en cours, terminés récents)", () => {
  it("trie par rang d'état puis par récence, borne à 5, note par état", () => {
    const tickets = [
      ticket(1, "done", 1),
      ticket(2, "in_progress"),
      ticket(3, "in_review"),
      ticket(4, "done", 9),
      ticket(5, "todo"),
      ticket(6, "in_review", 12),
      ticket(7, "blocked"),
    ];
    const out = sprintTicketsOf(tickets);
    expect(out.map((entry) => entry.key)).toEqual(["TK-6", "TK-3", "TK-2", "TK-4", "TK-1"]);
    expect(out[0]).toEqual({
      key: "TK-6",
      title: "Ticket 6",
      note: "En revue de code",
      status: "in_review",
    });
    expect(out.map((entry) => entry.note)).toEqual([
      "En revue de code",
      "En revue de code",
      "En cours",
      "Terminé",
      "Terminé",
    ]);
  });
});

describe("peopleOf : le client d'abord, puis l'équipe, 5 au plus", () => {
  const member = (name: string, role: string) => ({ name, role });
  it("ordre client, propriétaire, administrateur, développeur, designer ; libellés de rôle", () => {
    const people = peopleOf(
      [member("Marie Lefèvre", "client")],
      [
        member("Zoé", "designer"),
        member("Dan", "dev"),
        member("Awa", "owner"),
        member("Ben", "admin"),
      ],
    );
    expect(people.others).toBe(0);
    expect(people.items).toEqual([
      { name: "Marie Lefèvre", initials: "ML", role: "Client · valide le cadrage", kind: "client" },
      { name: "Awa", initials: "A", role: "Propriétaire", kind: "team" },
      { name: "Ben", initials: "B", role: "Administrateur", kind: "team" },
      { name: "Dan", initials: "D", role: "Développeur", kind: "team" },
      { name: "Zoé", initials: "Z", role: "Designer", kind: "team" },
    ]);
  });

  it("au-delà de 5 : « others » compte le reste", () => {
    const staff = Array.from({ length: 6 }, (_, i) => member(`Dev ${i}`, "dev"));
    const people = peopleOf([], staff);
    expect(people.items).toHaveLength(5);
    expect(people.others).toBe(1);
  });

  it("un métier lié est un client en lecture", () => {
    const [business] = peopleOf([member("Léa", "business")], []).items;
    expect(business).toMatchObject({ kind: "client", role: "Métier · lit et commente" });
  });
});
