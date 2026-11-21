import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clientArchitectureApi } from "./helpers/client-space-architecture.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { createReviewScene, P1_FEATURES, type ReviewScene, reviewApi } from "./helpers/reviews.ts";
import { type EntitySeed, entity, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-113 lot A (cas 7 et 11 ; B575 à B592) : `clientSpace.architecture`, `adrs`, `adr`, `archFlows`, `archFlow`. Les six rôles
 * lisent leurs projets (le client le sien : 404 ailleurs). Architecture non validée : `available` faux et aucun contenu, les
 * fiches en 404. Validée : composants, décisions et flux au vocabulaire du client, jamais YAML, Mermaid, chemin, SHA,
 * responsabilité technique, tables possédées ni proposition (test de fuite sur les clés et les valeurs).
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
const p1 = () => scene.p1.projectId;
const api = (actor: { cookie: string }) => clientArchitectureApi(bench().app, actor);

const API = {
  id: "C-api",
  titre: "API",
  nom: "API",
  type: "service",
  zone: "Noyau métier",
  responsabilite: "SECRET-responsabilité technique",
  possede: ["T-clients"],
  sert: ["F-001"],
  depend_de: [{ vers: "C-db", via: "SQL" }],
  decisions: ["ADR-001"],
  resume_client: ["Elle garde vos rendez-vous."],
};
const DB = {
  id: "C-db",
  titre: "Base",
  nom: "Base",
  type: "store",
  zone: "Données",
  responsabilite: "x",
};
const ADR1 = {
  id: "ADR-001",
  titre: "Monolithe modulaire",
  statut: "remplacee",
  remplacee_par: "ADR-002",
  date: "2026-10-28",
  decideurs: ["Moussa"],
  liens: ["C-api", "T-clients"],
  contexte: "Deux développeurs.",
  decision: "Un seul déploiement.",
  consequences: { positives: ["Simple."], a_accepter: ["Couplage."] },
  alternatives: [{ nom: "Microservices", raison: "Trop lourd." }],
  en_clair: "Un seul produit à faire vivre.",
};
const ADR2 = {
  ...ADR1,
  id: "ADR-002",
  titre: "Modules séparés",
  statut: "acceptee",
  remplacee_par: undefined,
  date: "2026-11-02",
};
const FLOW = {
  id: "P-001",
  titre: "P-001",
  participants: ["RL-client", "C-api", "C-db"],
  messages: [{ de: "RL-client", vers: "C-api", texte: "Demande", retour: "Réponse" }],
  fonctionnalites: ["F-001"],
  regles: [],
  decisions: ["ADR-001"],
};
const entities = (apiHash = "a"): EntitySeed[] => [
  entity("feature", "F-001", "a", { titre: "Réserver un créneau" }),
  entity("flow", "P-001", "a", { titre: "Réservation", acteur: "Client" }),
  entity("roles", "roles", "a", { roles: [{ id: "RL-client", nom: "Client" }] }),
  entity("component", "C-api", apiHash, API),
  entity("component", "C-db", "a", DB),
  entity("adr", "ADR-001", "a", ADR1),
  entity("adr", "ADR-002", "a", ADR2),
  entity("archflow", "P-001", "a", FLOW),
];
const head = async (list = entities()) =>
  (await seedIndex(bench(), scene.p1, P1_FEATURES, { commit: true, entities: list })).sha;
const validate = async (version: string) => {
  const res = await reviewApi(bench().app, scene.p1.world.actors.owner).submit(p1(), version, {
    targetKind: "deliverable",
    targetRef: "architecture",
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
};
const FORBIDDEN =
  /SECRET|responsabilite|possede|filePath|commitSha|"path"|yaml|mermaid|proposal|source|T-clients|architecture\/(adr|flows|components)/i;

beforeEach(async () => {
  scene = await createReviewScene(bench());
});

describe("architecture non validée", () => {
  it("available faux, à valider, aucun contenu ; décisions et flux vides ; fiches en 404", async () => {
    await head();
    const client = api(scene.c1);
    expect((await client.architecture(p1())).body).toEqual({
      available: false,
      validation: "to_validate",
      truncated: false,
      items: [],
      positions: {},
    });
    const adrs = await client.adrs(p1());
    expect(adrs.status).toBe(200);
    expect(adrs.body).toMatchObject({
      available: false,
      validation: "to_validate",
      items: [],
      total: 0,
    });
    expect((await client.flows(p1())).body).toMatchObject({
      available: false,
      items: [],
      total: 0,
    });
    expect((await client.adr(p1(), "ADR-001")).status).toBe(404);
    expect((await client.flow(p1(), "P-001")).status).toBe(404);
  });

  it("amont modifié après la décision (À revoir) : de nouveau indisponible", async () => {
    await validate(await head());
    await head(
      entities().map((e) =>
        e.specId === "F-001"
          ? entity("feature", "F-001", "b", { titre: "Réserver un créneau" })
          : e,
      ),
    );
    expect((await api(scene.c1).architecture(p1())).body).toMatchObject({
      available: false,
      validation: "to_revise",
      items: [],
    });
  });

  it("élément modifié après la décision : à valider, indisponible", async () => {
    await validate(await head());
    await head(entities("modifié"));
    expect((await api(scene.c1).architecture(p1())).body).toMatchObject({
      available: false,
      validation: "to_validate",
    });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("architecture validée", () => {
  beforeEach(async () => {
    await validate(await head());
  });

  it("composants : nom, type, zone, phrases, fonctionnalité par libellé, dépendance par nom", async () => {
    const res = await api(scene.c1).architecture(p1());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ available: true, validation: "validated", truncated: false });
    expect(res.body.items.find((c: { id: string }) => c.id === "C-api")).toEqual({
      id: "C-api",
      name: "API",
      type: "service",
      zone: "Noyau métier",
      summary: ["Elle garde vos rendez-vous."],
      serves: [{ id: "F-001", label: "Réserver un créneau" }],
      dependsOn: [{ id: "C-db", name: "Base", via: "SQL" }],
    });
  });

  it("décisions : liste (id, titre, statut, date) et fiche avec En clair, remplaçante et sa date", async () => {
    const list = await api(scene.c1).adrs(p1());
    expect(list.body).toMatchObject({ available: true, validation: "validated", total: 2 });
    expect(list.body.items).toEqual([
      { id: "ADR-001", title: "Monolithe modulaire", status: "remplacee", date: "2026-10-28" },
      { id: "ADR-002", title: "Modules séparés", status: "acceptee", date: "2026-11-02" },
    ]);
    const filtered = await api(scene.c1).adrs(p1(), "?status=acceptee");
    expect(filtered.body.items.map((i: { id: string }) => i.id)).toEqual(["ADR-002"]);
    const one = await api(scene.c1).adr(p1(), "ADR-001");
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect(one.body).toEqual({
      id: "ADR-001",
      title: "Monolithe modulaire",
      status: "remplacee",
      date: "2026-10-28",
      deciders: ["Moussa"],
      context: "Deux développeurs.",
      decision: "Un seul déploiement.",
      consequences: { positive: ["Simple."], toAccept: ["Couplage."] },
      alternatives: [{ name: "Microservices", reason: "Trop lourd." }],
      supersededBy: "ADR-002",
      supersededOn: "2026-11-02",
      plain: "Un seul produit à faire vivre.",
    });
    expect((await api(scene.c1).adr(p1(), "ADR-999")).status).toBe(404);
    expect((await api(scene.c1).adr(p1(), "api")).status).toBe(400);
  });

  it("flux : liste et séquence, sans chemin, SHA ni décisions", async () => {
    const list = await api(scene.c1).flows(p1());
    expect(list.body).toMatchObject({ available: true, total: 1 });
    expect(list.body.items[0]).toMatchObject({
      specId: "P-001",
      title: "Réservation",
      actor: "Client",
    });
    const one = await api(scene.c1).flow(p1(), "P-001");
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect(one.body.items).toEqual([
      { kind: "message", from: "RL-client", to: "C-api", text: "Demande", reply: "Réponse" },
    ]);
    expect(Object.keys(one.body).sort()).toEqual(
      ["actor", "features", "items", "participants", "rules", "specId", "title"].sort(),
    );
    expect((await api(scene.c1).flow(p1(), "P-999")).status).toBe(404);
  });

  it("test de fuite : aucune réponse ne porte de clé ni de valeur interdite (cas 11 : filePath jamais renvoyé)", async () => {
    const client = api(scene.c1);
    const bodies = [
      (await client.architecture(p1())).body,
      (await client.adrs(p1())).body,
      (await client.adr(p1(), "ADR-001")).body,
      (await client.flows(p1())).body,
      (await client.flow(p1(), "P-001")).body,
    ];
    for (const body of bodies) expect(JSON.stringify(body)).not.toMatch(FORBIDDEN);
  });

  it.each(["business", "owner", "admin", "dev", "designer"] as const)(
    "%s lit l'architecture validée de son organisation",
    async (role) => {
      const res = await api(scene.p1.world.actors[role]).architecture(p1());
      expect(res.status, role).toBe(200);
      expect(res.body.available, role).toBe(true);
    },
  );

  it("un client d'un autre projet, ou sans lien : 404 sur les cinq lectures", async () => {
    for (const actor of [scene.c2, scene.c3]) {
      const client = api(actor);
      for (const res of [
        await client.architecture(p1()),
        await client.adrs(p1()),
        await client.adr(p1(), "ADR-001"),
        await client.flows(p1()),
        await client.flow(p1(), "P-001"),
      ]) {
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).not.toMatch(/Monolithe|API/);
      }
    }
  });

  it("sans session : 401", async () => {
    expect((await clientArchitectureApi(bench().app, undefined).architecture(p1())).status).toBe(
      401,
    );
  });

  it("la lecture n'écrit rien : aucune entrée d'audit nouvelle", async () => {
    const before = await bench().database.query("SELECT count(*)::int AS n FROM audit_log");
    await api(scene.c1).architecture(p1());
    await api(scene.c1).adrs(p1());
    const after = await bench().database.query("SELECT count(*)::int AS n FROM audit_log");
    expect(after).toEqual(before);
  });
});
