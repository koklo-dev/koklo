import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clientSpaceApi } from "./helpers/client-space.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { createReviewScene, P1_FEATURES, type ReviewScene, reviewApi } from "./helpers/reviews.ts";
import { type EntitySeed, entity, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-109 lot A (B450 à B452) : `clientSpace.dataModel`, `dataFixtures`, `dataFixtureRows`. TK-110 lot A (B482) : `dataZones`,
 * `dataZone`, `dataSearch`, `dataFixturePage` (mêmes règles : non validé = vide ou 404, validé = vocabulaire du client). Les six rôles lisent leurs projets
 * (le client le sien : 404 ailleurs). Modèle non validé : `available` faux, aucune table. Validé : tables au vocabulaire du
 * client (jamais contraintes, valeurs, règles par champ, chemins, SHA). Jeux d'exemple et lignes par pages de 25.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
const p1 = () => scene.p1.projectId;
const api = (actor: { cookie: string }) => clientSpaceApi(bench().app, actor);

const TABLE = {
  nom: "Clients",
  zone: "Comptes",
  description: "Les personnes qui réservent.",
  resume_client: ["Le nom du client", "Son adresse e-mail"],
  source: ["F-001", "R-004"],
  champs: [
    { nom: "id", type: "uuid", cle: "primaire" },
    {
      nom: "email",
      type: "texte(255)",
      contraintes: "Unique, secret-contrainte",
      valeurs: ["secret-valeur"],
      regle: "R-004",
      donnees_personnelles: true,
    },
  ],
  relations: [{ vers: "T-reservations", cardinalite: "1 → n" }],
};
const ROWS = Array.from({ length: 30 }, (_, i) => ({ nom: `Client ${i + 1}`, actif: i % 2 === 0 }));
const entities = (tableContent = "a"): EntitySeed[] => [
  entity("feature", "F-001", "a", { titre: "Connexion" }),
  entity("feature", "F-002", "a", { titre: "Profil" }),
  entity("rule", "R-004", "a", { titre: "Délai d'annulation" }),
  entity("table", "T-clients", tableContent, TABLE),
  entity("table", "T-reservations", "a", { nom: "Réservations" }),
  entity("fixture", "FX-clients", "a", { titre: "Clients", table: "T-clients", lignes: ROWS }),
];
const head = async (list = entities()) =>
  (await seedIndex(bench(), scene.p1, P1_FEATURES, { commit: true, entities: list })).sha;
const validate = async (version: string) => {
  const res = await reviewApi(bench().app, scene.p1.world.actors.owner).submit(p1(), version, {
    targetKind: "deliverable",
    targetRef: "data",
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
};

beforeEach(async () => {
  scene = await createReviewScene(bench());
});

describe("modèle non validé", () => {
  it("available faux, à valider, aucune table ni position ; jeux vides, lignes en 404", async () => {
    await head();
    const res = await api(scene.c1).dataModel(p1());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      available: false,
      validation: "to_validate",
      truncated: false,
      items: [],
      positions: {},
    });
    expect((await api(scene.c1).dataFixtures(p1())).body).toEqual({ items: [] });
    expect((await api(scene.c1).dataFixtureRows(p1(), "FX-clients")).status).toBe(404);
  });

  it("amont modifié après la décision (À revoir) : de nouveau indisponible", async () => {
    await validate(await head());
    await head(
      entities().map((e) =>
        e.specId === "F-001" ? entity("feature", "F-001", "b", { titre: "Connexion" }) : e,
      ),
    );
    const res = await api(scene.c1).dataModel(p1());
    expect(res.body).toMatchObject({ available: false, validation: "to_revise", items: [] });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("modèle validé", () => {
  beforeEach(async () => {
    await validate(await head());
  });

  it("tables au vocabulaire du client : champs réduits, relations nommées, liens libellés, résumé", async () => {
    const res = await api(scene.c1).dataModel(p1());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ available: true, validation: "validated", truncated: false });
    const clients = res.body.items.find((t: { id: string }) => t.id === "T-clients");
    expect(clients).toEqual({
      id: "T-clients",
      name: "Clients",
      zone: "Comptes",
      description: "Les personnes qui réservent.",
      fields: [
        { name: "id", type: "uuid", primaryKey: true, personalData: false },
        { name: "email", type: "texte(255)", primaryKey: false, personalData: true },
      ],
      relations: [{ to: "T-reservations", toName: "Réservations", cardinality: "1 → n" }],
      usedBy: [
        { id: "F-001", label: "Connexion" },
        { id: "R-004", label: "Délai d'annulation" },
      ],
      clientSummary: ["Le nom du client", "Son adresse e-mail"],
    });
    expect(res.body.items.map((t: { id: string }) => t.id)).toEqual([
      "T-clients",
      "T-reservations",
    ]);
  });

  it("le JSON brut ne contient ni contrainte, ni valeur, ni règle de champ, ni chemin, ni SHA, ni YAML", async () => {
    const raw = JSON.stringify([
      (await api(scene.c1).dataModel(p1())).body,
      (await api(scene.c1).dataFixtures(p1())).body,
      (await api(scene.c1).dataFixtureRows(p1(), "FX-clients")).body,
    ]);
    for (const secret of [
      "secret-contrainte",
      "secret-valeur",
      "contraintes",
      "valeurs",
      "regle",
      "data/tables",
      "data/fixtures",
      ".yaml",
      "mermaid",
      "commitSha",
      "filePath",
      "proposal",
      "propos",
    ]) {
      expect(raw, secret).not.toContain(secret);
    }
    expect(raw).not.toMatch(/\b[0-9a-f]{40}\b/);
  });

  it("jeux d'exemple et lignes par pages de 25 : titre, table, langue, nombre de lignes", async () => {
    const list = await api(scene.c1).dataFixtures(p1());
    expect(list.body).toEqual({
      items: [
        {
          specId: "FX-clients",
          title: "Clients",
          table: "T-clients",
          locale: "fr-FR",
          rowCount: 30,
        },
      ],
    });
    const first = await api(scene.c1).dataFixtureRows(p1(), "FX-clients", 1);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(25);
    expect(first.body).toMatchObject({ total: 30, columns: ["nom", "actif"] });
    expect((await api(scene.c1).dataFixtureRows(p1(), "FX-clients", 2)).body.items).toHaveLength(5);
    expect((await api(scene.c1).dataFixtureRows(p1(), "FX-inconnu", 1)).status).toBe(404);
  });
});

describe("modèle borné à 100 tables", () => {
  it("101 tables : 100 rendues et truncated vrai", async () => {
    const many = Array.from({ length: 101 }, (_, i) =>
      entity("table", `T-t${String(i).padStart(3, "0")}`, "a", { nom: `Table ${i}` }),
    );
    await validate(await head(many));
    const res = await api(scene.c1).dataModel(p1());
    expect(res.body.items).toHaveLength(100);
    expect(res.body.truncated).toBe(true);
  });
});

describe("accès", () => {
  beforeEach(async () => {
    await validate(await head());
  });

  it.each(["owner", "admin", "dev", "designer", "business"] as const)(
    "%s lit le modèle (200)",
    async (role) => {
      const res = await api(scene.p1.world.actors[role]).dataModel(p1());
      expect(res.status, role).toBe(200);
      expect(res.body.available).toBe(true);
    },
  );

  it("client lié : 200 ; client d'un autre projet, client sans lien, anonyme, autre organisation : 404 ou 401", async () => {
    expect((await api(scene.c1).dataModel(p1())).status).toBe(200);
    expect((await api(scene.c2).dataModel(p1())).status).toBe(404);
    expect((await api(scene.c3).dataModel(p1())).status).toBe(404);
    expect((await clientSpaceApi(bench().app, undefined).dataModel(p1())).status).toBe(401);
    expect((await api(scene.c2).dataFixtures(p1())).status).toBe(404);
    expect((await api(scene.c3).dataFixtureRows(p1(), "FX-clients")).status).toBe(404);
  });

  it("projet sans spec indexée : modèle indisponible, jamais d'erreur d'index", async () => {
    const res = await api(scene.c2).dataModel(scene.p2.projectId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available: false, items: [] });
  });
});

/** TK-110 lot A (B482, B483) : volume réel côté client, modèle validé seulement. */
const GENERATED = {
  titre: "Clients générés",
  table: "T-clients",
  lignes: [{ nom: "Léa Martin" }],
  generation: {
    graine: 7,
    total: 1240,
    regles: { nom: { type: "nom" }, email: { type: "email" } },
  },
};
const volumeEntities = (): EntitySeed[] => [
  ...entities(),
  entity("table", "T-sans-zone", "a", {
    nom: "Sans zone",
    relations: [{ vers: "T-clients", cardinalite: "n → 1" }],
  }),
  entity("fixture", "FX-generes", "a", GENERATED),
];

describe("TK-110 : modèle non validé", () => {
  it("zones, zone et recherche : available faux et rien d'autre ; page d'un jeu : 404", async () => {
    await head(volumeEntities());
    expect((await api(scene.c1).dataZones(p1())).body).toEqual({
      available: false,
      validation: "to_validate",
      zones: [],
      tableCount: 0,
    });
    expect((await api(scene.c1).dataZone(p1(), "comptes")).body).toMatchObject({
      available: false,
      items: [],
      relations: [],
      outgoing: [],
      truncated: false,
    });
    expect((await api(scene.c1).dataSearch(p1(), "client")).body).toEqual({
      available: false,
      items: [],
    });
    expect((await api(scene.c1).dataFixturePage(p1(), "FX-generes", 1, 50)).status).toBe(404);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-110 : modèle validé", () => {
  beforeEach(async () => {
    await validate(await head(volumeEntities()));
  });

  it("zones : une carte par zone, aperçu, liens entre zones, aucun identifiant technique", async () => {
    const res = await api(scene.c1).dataZones(p1());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ available: true, validation: "validated", tableCount: 3 });
    expect(res.body.zones).toEqual([
      {
        id: "comptes",
        name: "Comptes",
        icon: "folder_open",
        tableCount: 1,
        preview: ["Clients"],
        links: [{ to: "sans-zone", count: 2 }],
      },
      {
        id: "sans-zone",
        name: "Sans zone",
        icon: "folder_open",
        tableCount: 2,
        preview: ["Réservations", "Sans zone"],
        links: [{ to: "comptes", count: 2 }],
      },
    ]);
  });

  it("zone : tables au vocabulaire du client (ni contrainte, ni valeur, ni règle), relations, liens sortants", async () => {
    const res = await api(scene.c1).dataZone(p1(), "comptes");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.zone).toEqual({
      id: "comptes",
      name: "Comptes",
      icon: "folder_open",
      tableCount: 1,
    });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: "T-clients",
      name: "Clients",
      fields: [
        { name: "id", type: "uuid", primaryKey: true, personalData: false },
        { name: "email", type: "texte(255)", primaryKey: false, personalData: true },
      ],
      usedBy: [
        { id: "F-001", label: "Connexion" },
        { id: "R-004", label: "Délai d'annulation" },
      ],
    });
    expect(res.body.outgoing).toEqual([{ zone: "sans-zone", count: 2 }]);
    expect(res.body.truncated).toBe(false);
    const raw = JSON.stringify(res.body);
    for (const secret of [
      "secret-contrainte",
      "secret-valeur",
      "contraintes",
      "valeurs",
      "regle",
      ".yaml",
      "commitSha",
      "filePath",
    ]) {
      expect(raw, secret).not.toContain(secret);
    }
    expect((await api(scene.c1).dataZone(p1(), "inconnue")).status).toBe(404);
  });

  it("recherche : par nom de table et par nom de champ, 20 au plus, rien d'autre que id, nom et zone", async () => {
    const byName = await api(scene.c1).dataSearch(p1(), "Clients");
    expect(byName.body).toEqual({
      available: true,
      items: [{ id: "T-clients", name: "Clients", zone: "Comptes" }],
    });
    const byField = await api(scene.c1).dataSearch(p1(), "email");
    expect(byField.body.items.map((item: { id: string }) => item.id)).toEqual(["T-clients"]);
    expect((await api(scene.c1).dataSearch(p1(), "zzzzzz")).body).toEqual({
      available: true,
      items: [],
    });
    expect((await api(scene.c1).dataSearch(p1(), "")).status).toBe(400);
  });

  it("page d'un jeu : 1 240 lignes générées, tailles 25, 50 et 100 cohérentes, mêmes lignes que l'équipe", async () => {
    const list = await api(scene.c1).dataFixtures(p1());
    expect(
      list.body.items.find((item: { specId: string }) => item.specId === "FX-generes").rowCount,
    ).toBe(1240);
    const wide = await api(scene.c1).dataFixturePage(p1(), "FX-generes", 1, 100);
    expect(wide.status, JSON.stringify(wide.body)).toBe(200);
    expect(wide.body).toMatchObject({
      total: 1240,
      totalIsEstimate: false,
      columns: ["nom", "email"],
    });
    expect(wide.body.items).toHaveLength(100);
    expect(wide.body.items[0]).toEqual({ nom: "Léa Martin" });
    expect(String(wide.body.items[5].email)).toMatch(/@exemple\.fr$/);
    const small = await api(scene.c1).dataFixturePage(p1(), "FX-generes", 3, 25);
    expect(small.body.items).toEqual(wide.body.items.slice(50, 75));
    expect(
      (await api(scene.c1).dataFixturePage(p1(), "FX-generes", 13, 100)).body.items,
    ).toHaveLength(40);
    expect((await api(scene.c1).dataFixturePage(p1(), "FX-inconnu", 1, 25)).status).toBe(404);
    expect((await api(scene.c1).dataFixturePage(p1(), "FX-generes", 1, 30)).status).toBe(400);
  });

  it("accès : un client d'un autre projet ou sans lien reçoit 404 sur les quatre lectures", async () => {
    for (const actor of [scene.c2, scene.c3]) {
      const space = api(actor);
      for (const res of [
        await space.dataZones(p1()),
        await space.dataZone(p1(), "comptes"),
        await space.dataSearch(p1(), "client"),
        await space.dataFixturePage(p1(), "FX-generes", 1, 25),
      ]) {
        expect(res.status).toBe(404);
      }
    }
  });
});
