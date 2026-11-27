import { describe, expect, it } from "vitest";
import {
  abuseCases,
  RightsFileSchema,
  type RolesFile,
  RolesFileSchema,
  rightsFileOf,
  rightsMatrix,
} from "../src/index.ts";

/** TK-117 lot A (cas 2, B794) : matrice des droits, fusion des restrictions, cases d'abus. */
const roles: RolesFile = RolesFileSchema.parse({
  roles: [
    {
      id: "RL-cliente",
      nom: "Cliente",
      permissions: ["PM-rdv.lire", "PM-rdv.annuler"],
      restrictions: { "PM-rdv.lire": "Les siens" },
    },
    { id: "RL-gerante", nom: "Gérante", permissions: ["PM-rdv.lire", "PM-rdv.exporter"] },
  ],
  permissions: [
    { id: "PM-rdv.lire", libelle: "Voir des rendez-vous", action: "lire", ressource: "rdv" },
    { id: "PM-rdv.annuler", libelle: "Annuler", action: "modifier", ressource: "rdv" },
    { id: "PM-rdv.exporter", action: "executer", ressource: "rdv" },
  ],
});
const restrictions = [
  { role: "RL-cliente", permission: "PM-rdv.lire", restriction: "À venir seulement" },
  { role: "RL-gerante", permission: "PM-rdv.exporter", restriction: "Avec second facteur" },
  /** Jamais un octroi : la cliente n'a pas la permission, la restriction ne la donne pas. */
  { role: "RL-cliente", permission: "PM-rdv.exporter", restriction: "Les siens" },
];

describe("matrice des droits", () => {
  const matrix = rightsMatrix(roles, restrictions);

  it("actions = permissions, colonnes = rôles, dans l'ordre du Fonctionnel", () => {
    expect(matrix.map((row) => row.action)).toEqual([
      "PM-rdv.lire",
      "PM-rdv.annuler",
      "PM-rdv.exporter",
    ]);
    expect(matrix[0]?.cases.map((c) => c.role)).toEqual(["RL-cliente", "RL-gerante"]);
  });

  it("absente = non ; restriction du rôle et de la Sécurité fusionnées ; sinon oui", () => {
    expect(matrix.map((row) => row.cases.map((c) => [c.acces, c.restriction]))).toEqual([
      [
        ["restreint", "Les siens · À venir seulement"],
        ["oui", undefined],
      ],
      [
        ["oui", undefined],
        ["non", undefined],
      ],
      [
        ["non", undefined],
        ["restreint", "Avec second facteur"],
      ],
    ]);
  });

  it("libellé de la permission, sinon action et ressource ; textes identiques non répétés", () => {
    expect(matrix[2]?.libelle).toBe("executer rdv");
    const twice = rightsMatrix(roles, [restrictions[0] as never, restrictions[0] as never]);
    expect(twice[0]?.cases[0]?.restriction).toBe("Les siens · À venir seulement");
  });

  it("libellé ou restriction blancs : fichier toujours valide, case toujours restreinte", () => {
    const blank = RolesFileSchema.parse({
      roles: [
        {
          id: "RL-a",
          nom: "A",
          permissions: ["PM-x.lire"],
          restrictions: { "PM-x.lire": " " },
        },
      ],
      permissions: [{ id: "PM-x.lire", libelle: " ", action: "lire", ressource: "x" }],
    });
    const file = rightsFileOf(blank);
    expect(file.matrice[0]).toEqual({
      action: "PM-x.lire",
      libelle: "lire x",
      cases: [{ role: "RL-a", acces: "restreint" }],
    });
    expect(RightsFileSchema.safeParse(file).success).toBe(true);
  });

  it("un cas d'abus par case non ou restreinte", () => {
    expect(abuseCases(matrix).map((c) => `${c.role} ${c.action} ${c.acces}`)).toEqual([
      "RL-cliente PM-rdv.lire restreint",
      "RL-cliente PM-rdv.exporter non",
      "RL-gerante PM-rdv.annuler non",
      "RL-gerante PM-rdv.exporter restreint",
    ]);
  });
});

describe("fichier des droits généré", () => {
  it("régénère la matrice et conserve restrictions et propriété", () => {
    const previous = RightsFileSchema.parse({
      matrice: [],
      restrictions,
      propriete: ["Chacun ne voit que ses données."],
    });
    const file = rightsFileOf(roles, previous);
    expect(file.restrictions).toEqual(restrictions);
    expect(file.propriete).toEqual(["Chacun ne voit que ses données."]);
    expect(file.matrice).toEqual(rightsMatrix(roles, restrictions));
    expect(RightsFileSchema.safeParse(file).success).toBe(true);
  });

  it("sans fichier précédent : aucune restriction ni règle codée", () => {
    const file = rightsFileOf(roles);
    expect(file.restrictions).toEqual([]);
    expect(file.propriete).toEqual([]);
  });

  it("restrictions jointes bornées à la taille acceptée par le fichier", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      role: "RL-gerante",
      permission: "PM-rdv.lire",
      restriction: `${i} ${"x".repeat(290)}`,
    }));
    expect(
      RightsFileSchema.safeParse(
        rightsFileOf(roles, { ...rightsFileOf(roles), restrictions: many }),
      ).success,
    ).toBe(true);
  });
});
