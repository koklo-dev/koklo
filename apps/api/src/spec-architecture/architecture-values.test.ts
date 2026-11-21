import { describe, expect, it } from "vitest";
import {
  checksInputOf,
  componentDetail,
  componentSummary,
  docSectionsOf,
  pendingComponent,
} from "./architecture-values.ts";

/**
 * TK-111 lot B (B506 à B511) : lecture tolérante des composants de l'index (`spec_entities.data`), sections du document lues en
 * Git, composants et flux des propositions en attente. Rien n'est supposé : un champ absent reprend sa valeur neutre.
 */
const DATA = {
  id: "C-api",
  titre: "API",
  nom: "API",
  type: "service",
  zone: "Noyau",
  responsabilite: "Expose les procédures.\nValide les droits.",
  possede: ["T-client", 3],
  sert: ["F-001"],
  depend_de: [
    { vers: "C-db", via: "SQL" },
    { vers: "C-file", via: "AMQP", mode: "asynchrone" },
    { vers: "autre" },
  ],
  decisions: ["ADR-001"],
  resume_client: ["Il garde vos rendez-vous."],
};
const where = { filePath: "architecture/components/api.yaml", commitSha: "a".repeat(40) };

describe("composant de l'index", () => {
  it("ligne du tableau : première ligne de la responsabilité, nombre de dépendances, décisions", () => {
    expect(componentSummary("C-api", where.filePath, DATA)).toEqual({
      specId: "C-api",
      name: "API",
      type: "service",
      zone: "Noyau",
      responsibility: "Expose les procédures.",
      dependsOnCount: 3,
      decisions: ["ADR-001"],
      filePath: where.filePath,
    });
  });

  it("valeurs neutres sur une donnée incomplète : nom = identifiant, type app, zone vide", () => {
    expect(componentSummary("C-x", "p", {})).toMatchObject({
      name: "C-x",
      type: "app",
      zone: "",
      responsibility: "",
      dependsOnCount: 0,
      decisions: [],
    });
    expect(componentSummary("C-x", "p", { type: "lambda" }).type).toBe("app");
  });

  it("fiche : champs en anglais, dépendances valides seulement, asynchrone -> async, résumé client", () => {
    expect(componentDetail("C-api", DATA, where)).toEqual({
      specId: "C-api",
      name: "API",
      type: "service",
      zone: "Noyau",
      responsibility: "Expose les procédures.\nValide les droits.",
      owns: ["T-client"],
      serves: ["F-001"],
      dependsOn: [
        { to: "C-db", via: "SQL" },
        { to: "C-file", via: "AMQP", async: true },
      ],
      decisions: ["ADR-001"],
      clientSummary: ["Il garde vos rendez-vous."],
      ...where,
    });
    expect(componentDetail("C-api", { ...DATA, resume_client: [] }, where)).not.toHaveProperty(
      "clientSummary",
    );
  });
});

describe("sections du document", () => {
  const files = [
    {
      path: "architecture/overview/02-flux.md",
      content: "---\nstatut: validee\n---\n# Flux\n\nTexte.\n",
    },
    {
      path: "architecture/overview/01-contexte.md",
      content: "# Architecture : contexte\n\nÀ compléter.\n",
    },
    { path: "architecture/overview/03-vide.md", content: "# Plus tard\n" },
    { path: "architecture/overview/notes.md", content: "# Hors format\n\nx\n" },
    { path: "architecture/overview/04-sans-titre.md", content: "Texte seul.\n" },
  ];

  it("ordre = préfixe NN, statut du front matter, À rédiger si corps vide, titre de repli = slug ; hors format ignoré", () => {
    const sections = docSectionsOf(files);
    expect(sections.map((s) => [s.num, s.specId, s.status, s.title])).toEqual([
      [1, "DOC-contexte", "brouillon", "Architecture : contexte"],
      [2, "DOC-flux", "validee", "Flux"],
      [3, "DOC-vide", "a_rediger", "Plus tard"],
      [4, "DOC-sans-titre", "brouillon", "sans-titre"],
    ]);
    expect(sections[1]).toEqual({
      specId: "DOC-flux",
      slug: "flux",
      num: 2,
      path: "architecture/overview/02-flux.md",
      title: "Flux",
      status: "validee",
      markdown: "Texte.",
      updatedAt: null,
      lastAuthor: null,
    });
  });
});

describe("propositions en attente et avertissements", () => {
  it("composant proposé : identifiant du nom, dépendances et propriété lues du contenu anglais", () => {
    expect(
      pendingComponent({
        name: "Cache",
        type: "store",
        zone: "Noyau",
        responsibility: "Garde.",
        owns: ["T-client"],
        dependsOn: [{ to: "C-api", via: "HTTP", async: true }],
      }),
    ).toMatchObject({
      id: "C-cache",
      nom: "Cache",
      type: "store",
      possede: ["T-client"],
      depend_de: [{ vers: "C-api", via: "HTTP", mode: "asynchrone" }],
    });
    expect(pendingComponent({})).toBeUndefined();
    expect(pendingComponent({ name: "X", type: "lambda" })).toBeUndefined();
  });

  it("l'index plus les propositions en attente : une proposition qui possède la table lève l'avertissement", () => {
    const input = checksInputOf({
      features: ["F-001"],
      tables: ["T-client"],
      flows: ["P-reserver"],
      components: [{ specId: "C-api", data: DATA }],
      archflows: [],
      pending: [
        {
          kind: "component",
          payload: {
            name: "Base",
            type: "store",
            zone: "Z",
            responsibility: "R",
            owns: ["T-client"],
          },
        },
        { kind: "archflow", payload: { flow: "P-reserver" } },
        { kind: "adr", payload: { title: "Ignorée" } },
      ],
    });
    expect(input.components.map((c) => c.value.id)).toEqual(["C-api", "C-base"]);
    expect(input.archFlows.map((f) => f.value.id)).toEqual(["P-reserver"]);
  });
});
