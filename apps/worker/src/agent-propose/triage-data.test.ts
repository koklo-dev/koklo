import { describe, expect, it } from "vitest";
import { type TriageContext, titleKey, triageProposals } from "./triage.ts";

/**
 * TK-107 lot B (cas 11, B387) : tri des propositions `table`, `relations`, `fixtures`. Une table dont `source`, `rule` ou
 * `ref` vise l'inconnu, un doublon de nom, un texte non brut sont écartés et comptés ; `relations` et `fixtures` ne visent
 * que des tables connues (cahier ou même génération).
 */
const context = (over: Partial<TriageContext> = {}): TriageContext => ({
  kinds: ["table", "relations", "fixtures"],
  titles: { table: new Set([titleKey("Salle")]) },
  missingCriteria: new Map(),
  refs: {
    specIds: new Set(["F-001", "R-004"]),
    tables: new Map<string, ReadonlySet<string> | null>([["T-salle", null]]),
  },
  ...over,
});
const table = (name: string, over: Record<string, unknown> = {}) => ({
  kind: "table",
  rationale: "Absente du modèle",
  content: {
    name,
    sources: ["F-001"],
    fields: [
      { name: "id", type: "uuid", primaryKey: true },
      { name: "salle_id", type: "ref(T-salle)" },
    ],
    ...over,
  },
});
const relations = (from: string, to: string) => ({
  kind: "relations",
  rationale: "Liens",
  content: { relations: [{ from, to, cardinality: "n → 1" }] },
});
const fixtures = (title: string, tableId: string, rows: object[] = [{ id: "1" }]) => ({
  kind: "fixtures",
  rationale: "Données de démonstration",
  content: { title, table: tableId, rows },
});
const run = (proposals: unknown[], ctx = context()) => triageProposals({ proposals }, ctx);

describe("triage des tables", () => {
  it("accepte une table valide : titre = nom, la table devient connue pour la suite", () => {
    const ctx = context();
    const { accepted, discarded } = run(
      [table("Réservation"), relations("T-reservation", "T-salle")],
      ctx,
    );
    expect(discarded).toBe(0);
    expect(accepted.map((a) => [a.kind, a.title])).toEqual([
      ["table", "Réservation"],
      ["relations", "Relations"],
    ]);
  });

  it("écarte et compte : doublon de nom (cahier ou génération), source, règle ou ref inconnues, texte non brut", () => {
    const { accepted, discarded } = run([
      table("Réservation"),
      table("salle"),
      table("réservation"),
      table("Source", { sources: ["F-999"] }),
      table("Règle", { fields: [{ name: "x", type: "entier", rule: "R-999" }] }),
      table("Ref", { fields: [{ name: "x", type: "ref(T-absente)" }] }),
      table("Voir https://exemple.fr"),
    ]);
    expect(accepted.map((a) => a.title)).toEqual(["Réservation"]);
    expect(discarded).toBe(6);
  });

  it("clientSummary : phrases simples acceptées ; lien, balise ou 13 phrases écartés (3.7.0)", () => {
    const { accepted, discarded } = run([
      table("Réservation", { clientSummary: ["Le nom du client", "Sa date de réservation"] }),
      table("Lien", { clientSummary: ["voir https://exemple.fr"] }),
      table("Balise", { clientSummary: ["<b>gras</b>"] }),
      table("Trop", { clientSummary: Array.from({ length: 13 }, (_, i) => `Phrase ${i}`) }),
    ]);
    expect(accepted.map((a) => a.title)).toEqual(["Réservation"]);
    expect(discarded).toBe(3);
  });

  it("une table peut viser une table de la même génération, et elle-même", () => {
    const { accepted } = run([
      table("Client", { fields: [{ name: "id", type: "uuid", primaryKey: true }] }),
      table("Commande", {
        fields: [
          { name: "client_id", type: "ref(T-client)" },
          { name: "parent", type: "ref(T-commande)" },
        ],
      }),
    ]);
    expect(accepted).toHaveLength(2);
  });
});

describe("triage des relations et des jeux", () => {
  it("relations : seules les tables connues ; une seule proposition par lancement", () => {
    const { accepted, discarded } = run([
      relations("T-salle", "T-fantome"),
      relations("T-fantome", "T-salle"),
      relations("T-salle", "T-salle"),
      relations("T-salle", "T-salle"),
    ]);
    expect(accepted).toHaveLength(1);
    expect(discarded).toBe(3);
  });

  it("fixtures : la table doit être connue, doublon de titre écarté, e-mail réel écarté", () => {
    const { accepted, discarded } = run([
      fixtures("Salles de démonstration", "T-salle"),
      fixtures("salles de démonstration", "T-salle"),
      fixtures("Autre", "T-fantome"),
      fixtures("Mails", "T-salle", [{ email: "vrai@gmail.com" }]),
    ]);
    expect(accepted.map((a) => [a.kind, a.title])).toEqual([
      ["fixtures", "Salles de démonstration"],
    ]);
    expect(discarded).toBe(3);
  });

  it("un type que le mode ne demande pas est écarté", () => {
    const { accepted, discarded } = run([table("Réservation")], context({ kinds: ["fixtures"] }));
    expect(accepted).toHaveLength(0);
    expect(discarded).toBe(1);
  });
});

describe("jeu d'exemple et champs de sa table (staging, 2026-11-13)", () => {
  it("un jeu bâti sur une autre version d'une table déjà proposée est écarté", () => {
    const result = run([
      table("Absence"),
      fixtures("Absences d'exemple", "T-absence", [{ id: "1", date_debut: "2025-02-03" }]),
      fixtures("Absences valides", "T-absence", [{ id: "2", salle_id: "s1" }]),
    ]);
    expect(result.accepted.map((c) => c.title)).toEqual(["Absence", "Absences valides"]);
    expect(result.discarded).toBe(1);
  });

  it("une table actuelle aux champs connus contrôle aussi ses jeux ; champs inconnus (null) : non contrôlés", () => {
    const ctx = context({
      refs: {
        specIds: new Set(["F-001"]),
        tables: new Map<string, ReadonlySet<string> | null>([
          ["T-client", new Set(["id", "nom"])],
          ["T-salle", null],
        ]),
      },
    });
    const result = run(
      [
        fixtures("Clients faux", "T-client", [{ id: "1", age: 3 }]),
        fixtures("Clients", "T-client", [{ id: "1", nom: "Ada" }]),
        fixtures("Salles", "T-salle", [{ id: "1", quoi: "x" }]),
      ],
      ctx,
    );
    expect(result.accepted.map((c) => c.title)).toEqual(["Clients", "Salles"]);
  });
});
