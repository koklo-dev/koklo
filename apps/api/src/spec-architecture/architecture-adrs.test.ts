import { describe, expect, it } from "vitest";
import { adrDetail, adrFilter, adrSummary, adrSupersession } from "./architecture-adrs.ts";

/**
 * TK-113 lot A (B575 à B592) : lecture tolérante des décisions de l'index (`spec_entities.data`, format du worker) : résumé de
 * liste, fiche, date de la remplaçante, filtres de la liste. Rien n'est supposé : un champ absent reprend sa valeur neutre ;
 * le texte n'est jamais interprété.
 */
const DATA = {
  id: "ADR-004",
  titre: "Connexion par lien magique",
  statut: "remplacee",
  remplacee_par: "ADR-009",
  date: "2026-10-29",
  decideurs: ["Moussa", "Awa", 3],
  liens: ["C-auth", "F-007", "R-003", "T-user", "P-login", "NFR-001", "autre"],
  contexte: "Le personnel change souvent.",
  decision: "Lien à usage unique.",
  consequences: { positives: ["Aucun mot de passe."], a_accepter: ["Dépend des e-mails."] },
  alternatives: [{ nom: "Mot de passe", raison: "Partage à l'accueil." }, { nom: "" }, "x"],
  en_clair: "On se connecte avec un lien reçu par e-mail.",
};
const where = { filePath: "architecture/adr/ADR-004-lien-magique.md", commitSha: "a".repeat(40) };

describe("résumé d'une ligne de la liste", () => {
  it("titre, statut, date, liens reconnus dans l'ordre du fichier, remplaçante, chemin", () => {
    expect(adrSummary("ADR-004", where.filePath, DATA)).toEqual({
      specId: "ADR-004",
      title: "Connexion par lien magique",
      status: "remplacee",
      date: "2026-10-29",
      links: ["C-auth", "F-007", "R-003", "T-user", "P-login"],
      supersededBy: "ADR-009",
      filePath: where.filePath,
    });
  });

  it("données illisibles : titre repli sur l'identifiant, statut proposée, aucun lien", () => {
    expect(adrSummary("ADR-001", "p.md", null)).toEqual({
      specId: "ADR-001",
      title: "ADR-001",
      status: "proposee",
      date: "",
      links: [],
      filePath: "p.md",
    });
    expect(
      adrSummary("ADR-001", "p.md", { statut: 3, remplacee_par: "x", liens: "C-a" }),
    ).toMatchObject({
      status: "proposee",
      links: [],
    });
    expect(adrSummary("ADR-001", "p.md", { remplacee_par: "x" })).not.toHaveProperty(
      "supersededBy",
    );
  });
});

describe("fiche", () => {
  it("toutes les sections, conséquences positives et à accepter, alternatives valides, En clair", () => {
    expect(adrDetail("ADR-004", DATA, where, "2026-11-02")).toEqual({
      specId: "ADR-004",
      title: "Connexion par lien magique",
      status: "remplacee",
      date: "2026-10-29",
      deciders: ["Moussa", "Awa"],
      context: "Le personnel change souvent.",
      decision: "Lien à usage unique.",
      consequences: { positive: ["Aucun mot de passe."], toAccept: ["Dépend des e-mails."] },
      alternatives: [{ name: "Mot de passe", reason: "Partage à l'accueil." }],
      links: ["C-auth", "F-007", "R-003", "T-user", "P-login"],
      supersededBy: "ADR-009",
      supersededOn: "2026-11-02",
      plain: "On se connecte avec un lien reçu par e-mail.",
      filePath: where.filePath,
      commitSha: where.commitSha,
    });
  });

  it("sans remplaçante ni En clair : ces champs sont absents, sections vides tolérées", () => {
    const detail = adrDetail("ADR-002", { id: "ADR-002", titre: "T", statut: "acceptee" }, where);
    expect(detail).toMatchObject({
      status: "acceptee",
      deciders: [],
      context: "",
      consequences: { positive: [], toAccept: [] },
      alternatives: [],
    });
    expect(detail).not.toHaveProperty("supersededBy");
    expect(detail).not.toHaveProperty("supersededOn");
    expect(detail).not.toHaveProperty("plain");
  });

  it("le texte reste du texte : balises et formules ne sont ni retirées ni interprétées", () => {
    const hostile = "<img src=x onerror=alert(1)> {{secret}} =CMD()";
    const detail = adrDetail("ADR-003", { ...DATA, contexte: hostile }, where);
    expect(detail.context).toBe(hostile);
  });
});

describe("date de la remplaçante", () => {
  it("dates des décisions citées : celle de la remplaçante, absente si elle est inconnue ou sans date", () => {
    const dates = new Map([["ADR-009", "2026-11-02"]]);
    expect(adrSupersession(DATA, dates)).toBe("2026-11-02");
    expect(adrSupersession({ remplacee_par: "ADR-010" }, dates)).toBeUndefined();
    expect(adrSupersession({ statut: "acceptee" }, dates)).toBeUndefined();
  });
});

describe("filtres de la liste (clauses de recherche en base)", () => {
  it("statut, période et composant se traduisent en conditions sur data, jamais en SQL libre", () => {
    expect(adrFilter({})).toEqual([]);
    expect(adrFilter({ status: "acceptee" })).toEqual([
      { data: { path: ["statut"], equals: "acceptee" } },
    ]);
    expect(adrFilter({ from: "2026-01-11", to: "2026-01-20" })).toEqual([
      { data: { path: ["date"], gte: "2026-01-11" } },
      { data: { path: ["date"], lte: "2026-01-20" } },
    ]);
    expect(adrFilter({ component: "C-api" }, ["ADR-010"])).toEqual([
      {
        OR: [
          { data: { path: ["liens"], array_contains: ["C-api"] } },
          { specId: { in: ["ADR-010"] } },
        ],
      },
    ]);
  });
});
