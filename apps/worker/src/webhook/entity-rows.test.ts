import {
  emitAdrMarkdown,
  emitArchFlowYaml,
  emitComponentYaml,
  emitFixtureYaml,
  emitFlowYaml,
  emitRolesYaml,
  emitRuleMarkdown,
  emitTableYaml,
  parseSpecFiles,
} from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { entityRowsOf } from "./entity-rows.ts";
import { adrCounterOf, nfrCounterOf, rowsOf, ruleCounterOf } from "./index-rows.ts";

/** TK-103 lot A : lignes `spec_entities` des règles (tri numérique), rôles, parcours YAML et JSON hérité ; jamais d'échec d'index. */
const rule = (n: number, over: Record<string, unknown> = {}) => ({
  path: `domain/rules/R-${String(n).padStart(3, "0")}-x.md`,
  content: emitRuleMarkdown({
    id: `R-${String(n).padStart(3, "0")}`,
    titre: `Règle ${n}`,
    type: "contrainte",
    tables: [],
    endpoints: [],
    enonce: "Énoncé.",
    exemples: [],
    ...over,
  }),
});
const flowPath = "design/flows/P-inscription.yaml";
const flow = {
  path: flowPath,
  content: emitFlowYaml({
    id: "P-inscription",
    titre: "Inscription",
    acteur: "Visiteur",
    depart: { libelle: "Ouvrir" },
    etapes: [{ libelle: "Remplir" }],
    erreurs: [],
    fonctionnalites: [],
  }),
};
const roles = {
  path: "domain/roles.yaml",
  content: emitRolesYaml({
    roles: [{ id: "RL-a", nom: "A", description: "Rôle A", permissions: [] }],
    permissions: [],
  }),
};
const rowsFor = (files: { path: string; content: string }[]) => {
  const { spec } = parseSpecFiles(files);
  const legacy = files.filter((f) => f.path.endsWith(".json"));
  return entityRowsOf(spec, legacy);
};
const of = (rows: ReturnType<typeof rowsFor>, kind: string) => rows.filter((r) => r.kind === kind);

describe("entityRowsOf : règles, rôles, parcours", () => {
  it("règles triées par numéro : R-999 avant R-1000 (sort croissant)", () => {
    const rows = of(rowsFor([rule(1000), rule(999), rule(2)]), "rule");
    expect(rows.map((r) => r.specId)).toEqual(["R-002", "R-999", "R-1000"]);
    expect(rows.map((r) => r.sort)).toEqual([0, 1, 2]);
    expect(rows[0]?.data).toMatchObject({ titre: "Règle 2" });
  });

  it("une règle sans titre reçoit en index le début de son énoncé", () => {
    const old = {
      path: "domain/rules/R-003-ancienne.md",
      content:
        "---\nid: R-003\ntype: contrainte\n---\n\n## Énoncé\nL'email est unique. Toujours.\n\n## Exemples\n",
    };
    const [row] = of(rowsFor([old]), "rule");
    expect(row?.data).toMatchObject({ id: "R-003" });
    expect((row?.data as { titre: string } | undefined)?.titre).toBe("L'email est unique.");
  });

  it("le fichier de rôles est une ligne roles avec un titre ; le parcours YAML une ligne flow avec titre", () => {
    const rows = rowsFor([roles, flow]);
    expect(of(rows, "roles")).toMatchObject([
      { specId: "roles", path: "domain/roles.yaml", data: { titre: "Rôles et permissions" } },
    ]);
    expect(of(rows, "flow")).toMatchObject([
      {
        specId: "P-inscription",
        path: flowPath,
        data: { titre: "Inscription", acteur: "Visiteur" },
      },
    ]);
  });

  it("un parcours .json hérité est encore lu (id du JSON), un .yaml invalide est ignoré", () => {
    const legacy = {
      path: "design/flows/P-001-inscription.json",
      content: JSON.stringify({ id: "P-001", titre: "Hérité", etapes: ["S-a"] }),
    };
    const broken = { path: "design/flows/P-cassé.yaml", content: "id: [\n" };
    const rows = of(rowsFor([legacy, broken, flow]), "flow");
    expect(rows.map((r) => r.specId).sort()).toEqual(["P-001", "P-inscription"]);
  });

  it("un fichier de règle invalide n'empêche pas l'index des autres", () => {
    const rows = of(
      rowsFor([{ path: "domain/rules/R-005-x.md", content: "rien" }, rule(1)]),
      "rule",
    );
    expect(rows.map((r) => r.specId)).toEqual(["R-001"]);
  });
});

describe("adrCounterOf (TK-111, B514)", () => {
  const adr = (n: number) => ({
    path: `architecture/adr/ADR-${String(n).padStart(3, "0")}-x.md`,
    content: emitAdrMarkdown({
      id: `ADR-${String(n).padStart(3, "0")}`,
      titre: `Décision ${n}`,
      statut: "proposee",
      date: "2026-11-21",
      decideurs: [],
      liens: [],
      contexte: "Contexte.",
      decision: "Décision.",
      consequences: { positives: [], a_accepter: [] },
      alternatives: [],
    }),
  });

  it("relève le compteur au plus grand ADR-nnn, rien à relever sans décision", () => {
    expect(adrCounterOf(parseSpecFiles([adr(2), adr(11)]).spec)).toEqual({
      raiseTo: 11,
      skipped: 0,
    });
    expect(adrCounterOf(parseSpecFiles([]).spec)).toEqual({ skipped: 0 });
  });
});

describe("ruleCounterOf", () => {
  it("relève le compteur au plus grand R-nnn et compte les identifiants trop grands", () => {
    const { spec } = parseSpecFiles([rule(3), rule(12)]);
    expect(ruleCounterOf(spec)).toEqual({ raiseTo: 12, skipped: 0 });
    expect(ruleCounterOf(parseSpecFiles([]).spec)).toEqual({ skipped: 0 });
  });
});

/** TK-107 lot A (B383, B388) : lignes `table` (titre = nom) et `fixture` ; fichier invalide ignoré sans échec d'index. */
describe("entityRowsOf : tables v2 et jeux d'exemple", () => {
  const manifest = {
    path: "koklo.project.yaml",
    content: "projet: demo\norganisation: acme\nspec_version: 2\n",
  };
  const table = {
    path: "data/tables/client.yaml",
    content: emitTableYaml({
      id: "T-client",
      nom: "Client",
      zone: "Clients",
      champs: [{ nom: "id", type: "uuid", cle: "primaire" }],
    }),
  };
  const fixture = {
    path: "data/fixtures/FX-clients.yaml",
    content: emitFixtureYaml({
      id: "FX-clients",
      titre: "Clients",
      table: "T-client",
      locale: "fr-FR",
      lignes: [{ id: "c-1" }],
    }),
  };

  it("une table v2 porte `titre` = son nom, zone data ; le contenu complet reste dans data", () => {
    const [row] = of(rowsFor([manifest, table]), "table");
    expect(row).toMatchObject({
      specId: "T-client",
      zone: "data",
      path: "data/tables/client.yaml",
      data: {
        id: "T-client",
        titre: "Client",
        nom: "Client",
        zone: "Clients",
        champs: [{ nom: "id" }],
      },
    });
  });

  it("un jeu d'exemple est une ligne fixture (zone data, titre du jeu), rang croissant", () => {
    const rows = of(rowsFor([manifest, table, fixture]), "fixture");
    expect(rows).toMatchObject([
      {
        specId: "FX-clients",
        zone: "data",
        path: "data/fixtures/FX-clients.yaml",
        data: { titre: "Clients", table: "T-client" },
        sort: 0,
      },
    ]);
    expect(rows[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("un fichier de table ou de jeu invalide est ignoré, sans échec d'index", () => {
    const broken = [
      { path: "data/tables/casse.yaml", content: "id: T-casse\nnom: [\n" },
      { path: "data/fixtures/FX-casse.yaml", content: "id: FX-casse\nlignes: 3\n" },
    ];
    const rows = rowsFor([manifest, table, fixture, ...broken]);
    expect(of(rows, "table").map((r) => r.specId)).toEqual(["T-client"]);
    expect(of(rows, "fixture").map((r) => r.specId)).toEqual(["FX-clients"]);
  });
});

/** TK-111 lot B : composants, flux techniques et décisions sont indexés (zone architecture) ; les sections ne le sont pas (B508). */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même livrable, un test par comportement
describe("entityRowsOf : architecture", () => {
  const manifest = {
    path: "koklo.project.yaml",
    content: "projet: demo\norganisation: acme\nspec_version: 2\n",
  };
  const component = (slug: string) => ({
    path: `architecture/components/${slug}.yaml`,
    content: emitComponentYaml({
      id: `C-${slug}`,
      nom: `Composant ${slug}`,
      type: "service",
      zone: "Noyau",
      responsabilite: "Fait son travail.",
      possede: [],
      sert: [],
      depend_de: [],
      decisions: [],
    }),
  });
  const archFlow = {
    path: "architecture/flows/P-reserver.yaml",
    content: emitArchFlowYaml({
      id: "P-reserver",
      participants: ["RL-a", "C-api"],
      messages: [{ de: "RL-a", vers: "C-api", texte: "Réserve" }],
      fonctionnalites: [],
      regles: [],
      decisions: [],
    }),
  };
  const adr = {
    path: "architecture/adr/ADR-001-base.md",
    content: emitAdrMarkdown({
      id: "ADR-001",
      titre: "Base relationnelle",
      statut: "acceptee",
      date: "2026-11-21",
      decideurs: [],
      liens: [],
      contexte: "Contexte.",
      decision: "Décision.",
      consequences: { positives: [], a_accepter: [] },
      alternatives: [],
    }),
  };

  it("un composant est une ligne component (zone architecture, titre = nom), rang croissant", () => {
    const rows = of(rowsFor([manifest, component("api"), component("db")]), "component");
    expect(rows).toMatchObject([
      {
        specId: "C-api",
        zone: "architecture",
        path: "architecture/components/api.yaml",
        data: { titre: "Composant api", nom: "Composant api", type: "service" },
        sort: 0,
      },
      { specId: "C-db", sort: 1 },
    ]);
    expect(rows[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("un flux technique est une ligne archflow (identifiant du parcours), une décision une ligne adr", () => {
    const rows = rowsFor([manifest, archFlow, adr]);
    expect(of(rows, "archflow")).toMatchObject([
      { specId: "P-reserver", zone: "architecture", data: { titre: "P-reserver" } },
    ]);
    expect(of(rows, "adr")).toMatchObject([
      { specId: "ADR-001", zone: "architecture", data: { titre: "Base relationnelle" } },
    ]);
  });

  it("un fichier invalide est ignoré, une section du document n'est jamais indexée", () => {
    const broken = { path: "architecture/components/casse.yaml", content: "id: C-casse\nnom: [\n" };
    const section = {
      path: "architecture/overview/01-contexte.md",
      content: "# Contexte\n\nTexte.\n",
    };
    const rows = rowsFor([manifest, component("api"), broken, section]);
    expect(of(rows, "component").map((r) => r.specId)).toEqual(["C-api"]);
    expect(rows.some((r) => r.path.startsWith("architecture/overview/"))).toBe(false);
  });
});

/** TK-115 : choix, opérations, exigences et environnements sont indexés ; les sections du cahier ne le sont pas. */
describe("entityRowsOf : cahier technique", () => {
  const stack = (slug: string, couche: string, extra = "") => ({
    path: `tech/stack/${slug}.yaml`,
    content: `id: ST-${slug}\ncouche: ${couche}\nrole: Rôle ${slug}\n${extra || "statut: a_trancher\n"}options:\n  - A\n  - B\npourquoi: p\n`,
  });
  const files = [
    stack("a", "exploitation"),
    stack("z", "applications", "statut: choisi\nchoix: Next.js\n"),
    stack("b", "applications"),
    stack("m", "donnees"),
    {
      path: "api/endpoints/avis.create.yaml",
      content:
        "id: avis.create\ntype: ecriture\nzone: Avis\ncomposant: C-api\npermission: public\nresume: Dépose un avis.\n",
    },
    {
      path: "api/endpoints/ancien.lire.yaml",
      content: "id: ancien.lire\nmethode: GET\nchemin: /a\n",
    },
    {
      path: "nfr/NFR-002.yaml",
      content:
        "id: NFR-002\ncategorie: performance\ntitre: Rapidité\ncible: p95\nenonce: Vite.\nverification:\n  mode: manuel\n",
    },
    { path: "tech/environments.yaml", content: "variables:\n  - nom: A\n    usage: u\n" },
    { path: "tech/cahier-technique/01-objet.md", content: "# Objet\n" },
  ];
  const rows = rowsFor(files);

  it("choix triés par couche puis identifiant, titre « rôle : choix »", () => {
    expect(of(rows, "stack").map((r) => [r.specId, r.sort, r.zone])).toEqual([
      ["ST-b", 0, "technical"],
      ["ST-z", 1, "technical"],
      ["ST-m", 2, "technical"],
      ["ST-a", 3, "technical"],
    ]);
    expect(of(rows, "stack").map((r) => (r.data as { titre: string }).titre)).toEqual([
      "Rôle b : à trancher",
      "Rôle z : Next.js",
      "Rôle m : à trancher",
      "Rôle a : à trancher",
    ]);
  });

  it("opérations (titre = résumé) avec les endpoints REST, exigences, un seul bloc d'environnements", () => {
    expect(of(rows, "endpoint").map((r) => r.specId)).toEqual(["ancien.lire", "avis.create"]);
    expect(of(rows, "endpoint")[1]?.data).toMatchObject({ titre: "Dépose un avis." });
    expect(of(rows, "nfr").map((r) => r.specId)).toEqual(["NFR-002"]);
    expect(of(rows, "environments")).toHaveLength(1);
    expect(of(rows, "environments")[0]).toMatchObject({
      specId: "environments",
      path: "tech/environments.yaml",
      data: { titre: "Environnements", variables: [{ nom: "A", usage: "u" }] },
    });
    expect(rows.some((r) => r.path.startsWith("tech/cahier-technique/"))).toBe(false);
  });

  it("l'index REST et le compteur nfr : le REST seul, le plus grand NFR-nnn", () => {
    const { spec } = parseSpecFiles(files);
    expect(rowsOf(spec).endpoints.map((row) => row.specId)).toEqual(["ancien.lire"]);
    expect(nfrCounterOf(spec)).toEqual({ raiseTo: 2, skipped: 0 });
  });
});

/** TK-116 (B772) : l'index range les opérations par zone puis nom, les exigences par catégorie puis identifiant. */
describe("entityRowsOf : ordre des opérations et des exigences", () => {
  const operation = (name: string, zone: string, extra = "") => ({
    path: `api/endpoints/${name}.yaml`,
    content: `id: ${name}\ntype: lecture\nzone: ${zone}\ncomposant: C-api\npermission: public\nresume: R.\n${extra}`,
  });
  const nfr = (id: string, categorie: string) => ({
    path: `nfr/${id}.yaml`,
    content: `id: ${id}\ncategorie: ${categorie}\ntitre: T\ncible: c\nenonce: E\nverification:\n  mode: manuel\n`,
  });
  const rows = rowsFor([
    operation("zeta.get", "Équipe"),
    operation("beta.get", "Paiement"),
    operation("alpha.list", "Paiement"),
    operation(
      "omega.get",
      "Agenda",
      "entree:\n  serviceId:\n    type: uuid\n  au:\n    type: date\n",
    ),
    nfr("NFR-001", "exploitation"),
    nfr("NFR-1000", "donnees"),
    nfr("NFR-002", "securite"),
    nfr("NFR-999", "donnees"),
  ]);
  const ordered = (kind: string) =>
    [...of(rows, kind)].sort((a, b) => a.sort - b.sort).map((row) => row.specId);

  it("opérations par zone (ordre alphabétique) puis nom", () => {
    expect(ordered("endpoint")).toEqual(["omega.get", "zeta.get", "alpha.list", "beta.get"]);
  });

  it("exigences par catégorie (ordre de la maquette) puis numéro", () => {
    expect(ordered("nfr")).toEqual(["NFR-999", "NFR-1000", "NFR-002", "NFR-001"]);
  });

  it("l'ordre des champs d'entrée et de sortie est gardé (jsonb réordonne les clés)", () => {
    const first = of(rows, "endpoint").find((row) => row.specId === "omega.get");
    expect(first?.data).toMatchObject({ champs: { entree: ["serviceId", "au"], sortie: [] } });
  });
});
