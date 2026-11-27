import { describe, expect, it, vi } from "vitest";
import { currentSecurity } from "../src/dossier-security.ts";
import {
  currentArchitecture,
  currentFeatures,
  currentTableIds,
  currentTechnical,
  type DossierClient,
  frozenPages,
  frozenVersion,
  previousVersion,
  publishedSynthesis,
  RISKS_SLUG,
  readFrozenDossier,
  versionsOf,
} from "../src/dossier-sources.ts";

const PROJECT = "p-1";

interface Fake {
  version?: unknown;
  pages?: { slug: string; title: string; contentMd: string; version: number }[];
  synthesis?: { contentMd: string; source: string | null } | null;
  repo?: { id: string; defaultBranch: string } | null;
  heads?: Record<string, { snapshot: { id: string; status: string } }>;
  features?: { specId: string; title: string; criteria: { title: string }[] }[];
  entities?: { kind: string; specId: string; data: unknown }[];
}

/** Client factice : chaque délégué rend la donnée de la scène, les appels sont observables. */
function fakeClient(scene: Fake) {
  const client = {
    ideaVersion: { findFirst: vi.fn(async (_args: unknown) => scene.version ?? null) },
    ideaPage: { findMany: vi.fn(async (_args: unknown) => scene.pages ?? []) },
    ideaSynthesis: { findFirst: vi.fn(async (_args: unknown) => scene.synthesis ?? null) },
    projectRepo: { findFirst: vi.fn(async (_args: unknown) => scene.repo ?? null) },
    specHead: {
      findFirst: vi.fn(
        async ({ where }: { where: { branch: string } }) => scene.heads?.[where.branch] ?? null,
      ),
    },
    specFeature: { findMany: vi.fn(async (_args: unknown) => scene.features ?? []) },
    specEntity: {
      findMany: vi.fn(async ({ where }: { where: { kind: { in: string[] } } }) =>
        (scene.entities ?? []).filter((entity) => where.kind.in.includes(entity.kind)),
      ),
    },
  };
  return { client, typed: client as unknown as DossierClient };
}

describe("versionsOf", () => {
  it("garde les numéros, ignore le reste et les valeurs qui ne sont pas des objets", () => {
    expect(versionsOf({ vision: 2, personas: "1", risques: 1 })).toEqual({ vision: 2, risques: 1 });
    expect(versionsOf(null)).toEqual({});
    expect(versionsOf([1, 2])).toEqual({});
    expect(versionsOf("x")).toEqual({});
  });
});

describe("frozenVersion et previousVersion", () => {
  it("sans baseVersion : la dernière version réglée ; avec baseVersion : ce numéro", async () => {
    const { client, typed } = fakeClient({ version: { number: 2, tag: "idea-v2" } });
    await frozenVersion(typed, PROJECT, null);
    expect(client.ideaVersion.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { projectId: PROJECT, commitSha: { not: null } },
      orderBy: { number: "desc" },
    });
    expect(client.ideaVersion.findFirst.mock.calls[0]?.[0]).not.toHaveProperty("where.number");
    await frozenVersion(typed, PROJECT, 1);
    expect(client.ideaVersion.findFirst.mock.calls[1]?.[0]).toMatchObject({ where: { number: 1 } });
  });

  it("previousVersion cherche un numéro strictement inférieur", async () => {
    const { client, typed } = fakeClient({});
    expect(await previousVersion(typed, PROJECT, 3)).toBeNull();
    expect(client.ideaVersion.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { number: { lt: 3 } },
    });
  });
});

describe("frozenPages", () => {
  const pages = [
    { slug: "vision", title: "Vision", contentMd: "v", version: 2 },
    { slug: "personas", title: "Personas", contentMd: "p", version: 3 },
    { slug: "cibles", title: "Cibles", contentMd: "c", version: 1 },
  ];

  it("exclut une page modifiée depuis le gel", async () => {
    const { typed } = fakeClient({ pages });
    const read = await frozenPages(typed, PROJECT, { vision: 2, personas: 2, cibles: 1 });
    expect(read.map((page) => page.slug)).toEqual(["vision", "cibles"]);
    expect(read[0]).toEqual({ slug: "vision", title: "Vision", content: "v" });
  });

  it("only restreint aux pages citées", async () => {
    const { typed } = fakeClient({ pages });
    const read = await frozenPages(typed, PROJECT, { vision: 2, cibles: 1 }, new Set(["cibles"]));
    expect(read.map((page) => page.slug)).toEqual(["cibles"]);
  });
});

describe("publishedSynthesis", () => {
  it("rend le texte d'une synthèse publiée, null sinon", async () => {
    expect(
      await publishedSynthesis(
        fakeClient({ synthesis: { contentMd: "S", source: "agent" } }).typed,
        PROJECT,
      ),
    ).toBe("S");
    expect(
      await publishedSynthesis(
        fakeClient({ synthesis: { contentMd: "S", source: null } }).typed,
        PROJECT,
      ),
    ).toBeNull();
    expect(await publishedSynthesis(fakeClient({}).typed, PROJECT)).toBeNull();
  });
});

describe("currentFeatures", () => {
  const features = [{ specId: "F-001", title: "Connexion", criteria: [{ title: "AC-1" }] }];

  it("sans dépôt de spec : aucune fonctionnalité", async () => {
    expect(await currentFeatures(fakeClient({}).typed, PROJECT)).toEqual([]);
  });

  it("lit la branche de cadrage d'abord", async () => {
    const { client, typed } = fakeClient({
      repo: { id: "r", defaultBranch: "main" },
      heads: { cadrage: { snapshot: { id: "s1", status: "ready" } } },
      features,
    });
    expect(await currentFeatures(typed, PROJECT)).toEqual([
      { specId: "F-001", title: "Connexion", criteria: ["AC-1"] },
    ]);
    expect(client.specFeature.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { snapshotId: "s1" },
      take: 300,
    });
  });

  it("sans tête de cadrage : la branche par défaut", async () => {
    const { client, typed } = fakeClient({
      repo: { id: "r", defaultBranch: "main" },
      heads: { main: { snapshot: { id: "s2", status: "ready" } } },
      features,
    });
    expect(await currentFeatures(typed, PROJECT)).toHaveLength(1);
    expect(client.specFeature.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { snapshotId: "s2" },
    });
  });

  it("index en échec : aucune fonctionnalité ; aucune tête : aucune fonctionnalité", async () => {
    const failed = fakeClient({
      repo: { id: "r", defaultBranch: "main" },
      heads: { cadrage: { snapshot: { id: "s1", status: "failed" } } },
      features,
    });
    expect(await currentFeatures(failed.typed, PROJECT)).toEqual([]);
    expect(failed.client.specFeature.findMany).not.toHaveBeenCalled();
    const none = fakeClient({ repo: { id: "r", defaultBranch: "main" }, heads: {} });
    expect(await currentFeatures(none.typed, PROJECT)).toEqual([]);
  });
});

describe("readFrozenDossier", () => {
  it("sans version figée : null, rien d'autre n'est lu", async () => {
    const { client, typed } = fakeClient({});
    expect(await readFrozenDossier(typed, PROJECT)).toBeNull();
    expect(client.ideaPage.findMany).not.toHaveBeenCalled();
  });

  it("sépare la page des risques des pages générales", async () => {
    const { typed } = fakeClient({
      version: { number: 1, tag: "idea-v1", pagesVersions: { vision: 1, [RISKS_SLUG]: 1 } },
      pages: [
        { slug: "vision", title: "Vision", contentMd: "v", version: 1 },
        { slug: RISKS_SLUG, title: "Risques", contentMd: "r", version: 1 },
      ],
      synthesis: { contentMd: "S", source: "agent" },
    });
    expect(await readFrozenDossier(typed, PROJECT)).toEqual({
      tag: "idea-v1",
      pages: [{ slug: "vision", title: "Vision", content: "v" }],
      synthesis: "S",
      risks: "r",
      features: [],
    });
  });

  it("sans page des risques : risks null", async () => {
    const { typed } = fakeClient({
      version: { number: 1, tag: "idea-v1", pagesVersions: { vision: 1 } },
      pages: [{ slug: "vision", title: "Vision", contentMd: "v", version: 1 }],
    });
    expect((await readFrozenDossier(typed, PROJECT))?.risks).toBeNull();
  });
});

/** TK-111 (B512) : ce que l'agent lit de l'architecture actuelle et des exigences connues ; titres seulement, jamais le contenu. */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même lecture, un test par comportement
describe("currentArchitecture", () => {
  const head = {
    repo: { id: "r-1", defaultBranch: "main" },
    heads: { cadrage: { snapshot: { id: "s-1", status: "ready" } } },
  };

  it("composants (nom, zone, type), flux, décisions et exigences connues des fonctionnalités", async () => {
    const { typed } = fakeClient({
      ...head,
      entities: [
        {
          kind: "component",
          specId: "C-api",
          data: {
            titre: "API",
            zone: "Noyau",
            type: "service",
            responsabilite: "secret interne",
            possede: ["T-user", 3],
            sert: ["F-001"],
            acteurs: ["RL-client", "C-x", 3],
            depend_de: [
              { vers: "C-db", via: "SQL" },
              { vers: "C-bus", via: "AMQP", mode: "asynchrone" },
              { vers: "base", via: "SQL" },
              { vers: "C-x" },
              "C-y",
            ],
          },
        },
        { kind: "archflow", specId: "P-reserver", data: { titre: "P-reserver" } },
        {
          kind: "adr",
          specId: "ADR-001",
          data: { titre: "Base relationnelle", statut: "acceptee" },
        },
        { kind: "feature", specId: "F-001", data: { nfr: ["NFR-002", "NFR-001"] } },
        { kind: "feature", specId: "F-002", data: { nfr: ["NFR-001"] } },
        { kind: "feature", specId: "F-003", data: {} },
      ],
    });
    const result = await currentArchitecture(typed, PROJECT);
    expect(result).toEqual({
      components: [
        {
          specId: "C-api",
          title: "API",
          zone: "Noyau",
          type: "service",
          owns: ["T-user"],
          serves: ["F-001"],
          actors: ["RL-client"],
          dependsOn: [
            { to: "C-db", via: "SQL" },
            { to: "C-bus", via: "AMQP", async: true },
          ],
        },
      ],
      archflows: [
        {
          specId: "P-reserver",
          title: "P-reserver",
          participants: [],
          messages: [],
          features: [],
          rules: [],
          decisions: [],
        },
      ],
      decisions: [{ specId: "ADR-001", title: "Base relationnelle" }],
      nfr: ["NFR-001", "NFR-002"],
    });
    expect(JSON.stringify(result)).not.toContain("secret interne");
  });

  it("TK-114d (B655) : flux techniques avec participants et messages en forme de proposition, éléments illisibles ignorés", async () => {
    const { typed } = fakeClient({
      ...head,
      entities: [
        {
          kind: "archflow",
          specId: "P-reserver",
          data: {
            titre: "P-reserver",
            participants: ["RL-client", "C-api", 4],
            messages: [
              { de: "RL-client", vers: "C-api", texte: "Réserve", retour: "Réservé" },
              {
                bloc: "alt",
                libelle: "Complet",
                messages: [
                  { de: "C-api", vers: "RL-client", texte: "Refuse", erreur: "Complet" },
                  "x",
                ],
              },
              { bloc: "separateur", libelle: "Plus tard" },
              { de: "C-api", texte: "sans cible" },
              { bloc: "boucle", libelle: "inconnu" },
            ],
            fonctionnalites: ["F-001"],
            regles: ["R-001"],
            decisions: ["ADR-001"],
          },
        },
      ],
    });
    const { archflows } = await currentArchitecture(typed, PROJECT);
    expect(
      {
        archflows: [
          {
            specId: "P-reserver",
            title: "P-reserver",
            participants: ["RL-client", "C-api"],
            messages: [
              { from: "RL-client", to: "C-api", text: "Réserve", reply: "Réservé" },
              {
                block: "alt",
                label: "Complet",
                messages: [{ from: "C-api", to: "RL-client", text: "Refuse", error: "Complet" }],
              },
              { block: "separator", label: "Plus tard" },
            ],
            features: ["F-001"],
            rules: ["R-001"],
            decisions: ["ADR-001"],
          },
        ],
      }.archflows,
    ).toEqual(archflows);
  });

  it("sans tête de spec : rien", async () => {
    const { typed } = fakeClient({});
    expect(await currentArchitecture(typed, PROJECT)).toEqual({
      components: [],
      archflows: [],
      decisions: [],
      nfr: [],
    });
  });
});

/** TK-114b (B616) : tous les identifiants de tables de la tête, sans le plafond de 200 des sources envoyées au modèle. */
describe("currentTableIds", () => {
  it("toutes les tables, au-delà de 200 ; sans tête : aucune", async () => {
    const entities = Array.from({ length: 250 }, (_, i) => ({
      kind: "table",
      specId: `T-t${i}`,
      data: { titre: `Table ${i}` },
    }));
    const { typed } = fakeClient({
      repo: { id: "r-1", defaultBranch: "main" },
      heads: { cadrage: { snapshot: { id: "s-1", status: "ready" } } },
      entities: [...entities, { kind: "component", specId: "C-x", data: {} }],
    });
    const result = await currentTableIds(typed, PROJECT);
    expect(result).toHaveLength(250);
    expect(result[249]).toBe("T-t249");
    expect(await currentTableIds(fakeClient({}).typed, PROJECT)).toEqual([]);
  });
});

/** TK-115 : le cahier technique actuel lu par l'agent ; ni endpoint REST, ni valeur de variable. */
describe("currentTechnical", () => {
  const head = {
    repo: { id: "r-1", defaultBranch: "main" },
    heads: { cadrage: { snapshot: { id: "s-1", status: "ready" } } },
  };

  it("choix (ouvert = sans choix), opérations du cahier seules, exigences, environnements, noms de variables", async () => {
    const { typed } = fakeClient({
      ...head,
      entities: [
        { kind: "stack", specId: "ST-sms", data: { role: "SMS", statut: "a_trancher" } },
        { kind: "stack", specId: "ST-db", data: { role: "Base", choix: "PostgreSQL" } },
        {
          kind: "endpoint",
          specId: "a.b",
          data: { zone: "Z", composant: "C-api", resume: "Fait." },
        },
        { kind: "endpoint", specId: "E-x", data: { methode: "GET", chemin: "/x" } },
        {
          kind: "nfr",
          specId: "NFR-001",
          data: { titre: "Vite", categorie: "performance", cible: "p95" },
        },
        {
          kind: "environments",
          specId: "environments",
          data: {
            environnements: [{ id: "ENV-recette", nom: "Recette" }],
            variables: [{ nom: "DATABASE_URL", usage: "Base", valeur: "jamais" }],
          },
        },
      ],
    });
    const current = await currentTechnical(typed, PROJECT);
    expect(current).toEqual({
      stacks: [
        { specId: "ST-sms", role: "SMS", choice: null },
        { specId: "ST-db", role: "Base", choice: "PostgreSQL" },
      ],
      operations: [{ specId: "a.b", zone: "Z", component: "C-api", summary: "Fait." }],
      requirements: [{ specId: "NFR-001", title: "Vite", category: "performance", target: "p95" }],
      environments: [{ specId: "ENV-recette", name: "Recette" }],
      variables: ["DATABASE_URL"],
    });
    expect(JSON.stringify(current)).not.toContain("jamais");
  });

  it("TK-115b : la couche enregistrée d'un choix est rendue ; absente ou vide, aucune clé", async () => {
    const { typed } = fakeClient({
      ...head,
      entities: [
        { kind: "stack", specId: "ST-db", data: { role: "Base", couche: "donnees" } },
        { kind: "stack", specId: "ST-sms", data: { role: "SMS", couche: "" } },
      ],
    });
    const { stacks } = await currentTechnical(typed, PROJECT);
    expect(stacks).toStrictEqual([
      { specId: "ST-db", role: "Base", choice: null, layer: "donnees" },
      { specId: "ST-sms", role: "SMS", choice: null },
    ]);
  });

  it("sans tête de spec : rien", async () => {
    const { typed } = fakeClient({});
    expect(await currentTechnical(typed, PROJECT)).toEqual({
      stacks: [],
      operations: [],
      requirements: [],
      environments: [],
      variables: [],
    });
  });
});

/** TK-117 : la Sécurité actuelle lue par l'agent ; ni contact, ni conservation, ni valeur. */
describe("currentSecurity", () => {
  const head = {
    repo: { id: "r-1", defaultBranch: "main" },
    heads: { cadrage: { snapshot: { id: "s-1", status: "ready" } } },
  };
  const entity = (kind: string, specId: string, data: unknown) => ({ kind, specId, data });

  it("menaces, entrées, droits, exigences, tables, opérations et rôles de la tête", async () => {
    const { typed } = fakeClient({
      ...head,
      entities: [
        entity("threat", "SEC-T01", { titre: "Abus", surfaces: ["F-001"], parades: ["x"] }),
        entity("sensitive", "t.a", {
          donnee: "A",
          champs: ["t.a"],
          categorie: "contact",
          conservation: "3 ans",
        }),
        entity("rights", "rights", {
          restrictions: [{ role: "RL-a", permission: "PM-b.c", restriction: "d" }],
          propriete: ["Chacun les siens."],
        }),
        entity("asvs", "asvs", {
          niveau: 2,
          exigences: [{ id: "EX-001", chapitre: "api", titre: "T", niveau: 1, reponse: "r" }],
          secrets_et_dependances: [{ libelle: "Secrets", valeur: "Coffre" }],
        }),
        entity("security_summary", "summary", { donnees: "x" }),
        entity("table", "T-t", { champs: [{ nom: "a" }, { nom: "b" }] }),
        entity("endpoint", "z.lire", { composant: "C-a", permission: "PM-b.c", sert: ["F-001"] }),
        entity("endpoint", "E-rest", { methode: "GET" }),
        entity("roles", "roles", { roles: [{ id: "RL-a", nom: "A", permissions: ["PM-b.c"] }] }),
      ],
    });
    expect(await currentSecurity(typed, PROJECT)).toEqual({
      threats: [{ specId: "SEC-T01", title: "Abus", surfaces: ["F-001"], measures: ["x"] }],
      entries: [{ fields: ["t.a"], name: "A", category: "contact" }],
      restrictions: [{ role: "RL-a", permission: "PM-b.c", restriction: "d" }],
      ownershipRules: ["Chacun les siens."],
      asvs: {
        level: 2,
        requirements: [{ id: "EX-001", chapter: "api", title: "T", level: 1, answered: true }],
        facts: ["Secrets"],
      },
      tables: [{ id: "T-t", champs: [{ nom: "a" }, { nom: "b" }] }],
      operations: [{ id: "z.lire", permission: "PM-b.c", serves: ["F-001"] }],
      roles: [{ id: "RL-a", name: "A", permissions: ["PM-b.c"] }],
      summary: true,
    });
  });

  it("rien d'indexé : listes vides, aucun résumé", async () => {
    const current = await currentSecurity(fakeClient({}).typed, PROJECT);
    expect(current).toMatchObject({ threats: [], entries: [], summary: false });
    expect(current.asvs).toEqual({ level: undefined, requirements: [], facts: [] });
  });
});
