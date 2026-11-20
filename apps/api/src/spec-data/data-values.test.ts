import { describe, expect, it } from "vitest";
import { fixturePage, fixtureSummary, tableDetail } from "./data-values.ts";

/** TK-109 : la fiche d'une table rend `clientSummary` (lu de `resume_client`) pour le formulaire « Ce qu'on enregistre ». */
const where = { filePath: "data/tables/client.yaml", commitSha: "a".repeat(40) };

describe("tableDetail : clientSummary", () => {
  it("rend les phrases du résumé client, dans l'ordre, sans valeur étrangère", () => {
    const detail = tableDetail(
      "T-client",
      { nom: "Client", resume_client: ["Le nom", 3, "", "L'e-mail"], champs: [] },
      where,
    );
    expect(detail.clientSummary).toEqual(["Le nom", "L'e-mail"]);
  });

  it("sans résumé : la clé est absente (la fiche existante ne change pas)", () => {
    expect(tableDetail("T-client", { nom: "Client" }, where)).not.toHaveProperty("clientSummary");
    expect(tableDetail("T-client", { resume_client: [] }, where)).not.toHaveProperty(
      "clientSummary",
    );
  });
});

/** TK-110 (B485) : pages d'un jeu, lignes stockées puis générées ; mêmes lignes pour l'équipe et le client. */
const GENERATED = {
  id: "FX-rdv",
  titre: "Rendez-vous",
  table: "T-rdv",
  locale: "fr-FR",
  lignes: [{ ref: "RDV-1", statut: "prévu" }],
  generation: {
    graine: 1240,
    total: 1240,
    regles: {
      ref: { type: "sequence", prefixe: "RDV-" },
      statut: { type: "choix", valeurs: ["prévu", "fait"] },
      email: { type: "email" },
    },
  },
};

describe("fixturePage", () => {
  it("jeu généré : total du bloc generation, page 2 de 25 = lignes 26 à 50", () => {
    const page = fixturePage(GENERATED, 2, 25);
    expect(page.total).toBe(1240);
    expect(page.items).toHaveLength(25);
    expect(page.items[0]?.ref).toBe("RDV-26");
    expect(page.items[24]?.ref).toBe("RDV-50");
  });

  it("colonnes : celles des lignes stockées puis celles des règles, quelle que soit la page", () => {
    expect(fixturePage(GENERATED, 1, 25).columns).toEqual(["ref", "statut", "email"]);
    expect(fixturePage(GENERATED, 40, 25).columns).toEqual(["ref", "statut", "email"]);
  });

  it("fin de jeu : dernière page partielle, au-delà vide", () => {
    expect(fixturePage(GENERATED, 25, 50).items).toHaveLength(40);
    expect(fixturePage(GENERATED, 26, 50).items).toEqual([]);
  });

  it("mêmes lignes quelle que soit la taille de page", () => {
    const wide = fixturePage(GENERATED, 1, 100).items;
    expect(fixturePage(GENERATED, 3, 25).items).toEqual(wide.slice(50, 75));
  });

  it("jeu sans generation : lignes stockées seulement (comportement d'avant)", () => {
    const stored = { ...GENERATED, generation: undefined, lignes: [{ a: 1 }, { a: 2 }, { a: 3 }] };
    expect(fixturePage(stored, 1, 2)).toEqual({
      columns: ["a"],
      items: [{ a: 1 }, { a: 2 }],
      total: 3,
    });
  });

  it("jeu indexé sans identité (id, titre, table) : les lignes générées restent servies", () => {
    const { id: _id, titre: _titre, table: _table, ...bare } = GENERATED;
    expect(fixturePage(bare, 1, 25).total).toBe(1240);
    expect(fixtureSummary("FX-rdv", "p", bare).rowCount).toBe(1240);
  });

  it("contenu hors schéma (generation illisible) : lignes stockées, jamais d'exception", () => {
    const broken = { ...GENERATED, generation: { total: "x" } };
    expect(fixturePage(broken, 1, 25)).toMatchObject({ total: 1, items: [{ ref: "RDV-1" }] });
    expect(fixturePage(null, 1, 25)).toEqual({ columns: [], items: [], total: 0 });
  });
});

describe("fixtureSummary : rowCount", () => {
  it("compte les lignes générées, pas seulement les stockées", () => {
    expect(fixtureSummary("FX-rdv", "data/fixtures/FX-rdv.yaml", GENERATED).rowCount).toBe(1240);
    expect(fixtureSummary("FX-a", "p", { lignes: [{}, {}] }).rowCount).toBe(2);
  });
});
