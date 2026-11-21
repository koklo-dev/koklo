import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { specIds, volumeWorld } from "./helpers/long-lists.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { commitAtHead, setEntityPath } from "./helpers/spec-architecture.ts";
import { entity, readScene, seedIndex } from "./helpers/spec-read.ts";
import { send, type World } from "./helpers/tickets.ts";

/**
 * TK-112 lot A (cas 4 et 5, B543, B544, B545) : `spec.architecture.flows.list` et `byId` sur `seed:large` (300 flux), type
 * d'élément `archflow` de `spec.item.get`, puis `spec.architecture.source` (YAML et Mermaid committés ou générés ; équipe et
 * designer seulement, jamais client ni business).
 */
let database: TestDatabase;
let app: INestApplication;
let world: World;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  world = await volumeWorld(database);
}, 240_000);
afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const get = (path: string, actor = world.actors.dev) =>
  send(app, actor.cookie, "get", `/projects/${world.projectId}/spec/${path}`);
const flows = (query = "") => get(`architecture/flows${query === "" ? "" : `?${query}`}`);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `P-flux-${String(from + i).padStart(3, "0")}`);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.architecture.flows.list sur seed:large", () => {
  it("300 flux, pages de 50 : total 300, curseur vers les suivants", async () => {
    const first = await flows();
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.total).toBe(300);
    expect(specIds(first.body)).toEqual(range(1, 50));
    expect(first.body.offset).toBe(0);
    expect(first.body.previousCursor).toBeNull();
    const second = await flows(`cursor=${first.body.nextCursor}`);
    expect(specIds(second.body)).toEqual(range(51, 100));
    expect(second.body.offset).toBe(50);
  });

  it("une ligne : titre (repli identifiant), acteur (repli : nom du rôle), composants et externes", async () => {
    const res = await flows("limit=100");
    const row = res.body.items.find((f: { specId: string }) => f.specId === "P-flux-003");
    expect(row).toEqual({
      specId: "P-flux-003",
      title: "P-flux-003",
      actor: "Administrateur",
      componentCount: 2,
      externalCount: 1,
    });
  });

  it("around amène un flux hors page 1 ; inconnu : 404 ; around avec curseur ou mal formé : 400", async () => {
    const around = await flows("around=P-flux-120");
    expect(specIds(around.body)).toContain("P-flux-120");
    expect(around.body.offset).toBe(100);
    expect((await flows("around=P-flux-999")).status).toBe(404);
    expect((await flows("around=P-flux-120&cursor=x")).status).toBe(400);
    expect((await flows("around=flux-120")).status).toBe(400);
  });

  it("recherche sur un flux non chargé (page 6) ; saisie à jokers ou à syntaxe SQL : rien, jamais d'erreur", async () => {
    const byId = await flows("q=P-flux-250");
    expect(specIds(byId.body)).toContain("P-flux-250");
    for (const q of ["999%", "a_b", "'; DROP TABLE spec_entities; --", "&|!"]) {
      const res = await flows(`q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
      expect(res.body.total, q).toBe(0);
    }
  });

  it.each(["owner", "admin", "dev", "designer"] as const)("%s lit la liste", async (role) => {
    expect((await get("architecture/flows", world.actors[role])).status).toBe(200);
  });

  it.each(["client", "business"] as const)(
    "%s : 403 sur la liste, le détail et la source",
    async (role) => {
      for (const path of [
        "architecture/flows",
        "architecture/flows/P-flux-003",
        "architecture/source?target[kind]=flow&target[id]=P-flux-003&format=mermaid",
        "architecture/source?target[kind]=schema",
        "items/archflow/P-flux-003",
      ]) {
        const res = await get(path, world.actors[role]);
        expect(res.status, `${role} ${path}`).toBe(403);
        expect(JSON.stringify(res.body)).not.toMatch(/sequenceDiagram|flowchart|id: P-flux/);
      }
    },
  );
});

describe("spec.architecture.flows.byId et spec.item.get archflow sur seed:large", () => {
  it("détail : participants nommés et typés, messages, bloc alt, liens, fichier et commit", async () => {
    const res = await get("architecture/flows/P-flux-003");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      specId: "P-flux-003",
      title: "P-flux-003",
      actor: "Administrateur",
      participants: [
        { id: "RL-administrateur", name: "Administrateur", type: "actor" },
        { id: "C-composant-004", name: "Composant 004", type: "ext" },
        { id: "C-composant-005", name: "Composant 005", type: "service" },
      ],
      features: ["F-004"],
      rules: ["R-004"],
      decisions: [],
      filePath: "architecture/flows/P-flux-003.yaml",
      commitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
    });
    expect(res.body.items.map((i: { kind: string }) => i.kind)).toEqual([
      "message",
      "message",
      "alt",
    ]);
    expect(res.body.items[0]).toEqual({
      kind: "message",
      from: "RL-administrateur",
      to: "C-composant-004",
      text: "Demande l'opération 003",
      reply: "Résultat de l'opération",
    });
  });

  it("spec.item.get archflow : les valeurs sont celles de flows.byId, avec referencedBy", async () => {
    const detail = await get("architecture/flows/P-flux-003");
    const item = await get("items/archflow/P-flux-003");
    expect(item.status, JSON.stringify(item.body)).toBe(200);
    expect(item.body).toMatchObject({ type: "archflow", id: "P-flux-003", validated: false });
    expect(item.body.values).toEqual(detail.body);
    expect(item.body.referencedBy).toEqual({ items: expect.any(Array), total: expect.any(Number) });
  });

  it("flux inconnu : 404 ; identifiant d'un autre genre : 400", async () => {
    expect((await get("architecture/flows/P-flux-999")).status).toBe(404);
    expect((await get("architecture/flows/C-composant-001")).status).toBe(400);
    expect((await get("items/archflow/P-flux-999")).status).toBe(404);
    expect((await get("items/archflow/C-composant-001")).status).toBe(400);
  });
});

const read = installBench({ beforeAll, afterAll, beforeEach });

const COMPONENT = {
  id: "C-api",
  titre: "API",
  nom: "API",
  type: "service",
  zone: "Coeur",
  responsabilite: "Expose.",
};
const DB = { ...COMPONENT, id: "C-db", titre: "Base", nom: "Base", type: "store" };
const FLOW = {
  id: "P-reserver",
  titre: "P-reserver",
  participants: ["RL-client", "C-api", "C-db"],
  messages: [
    { de: "RL-client", vers: "C-api", texte: "Réserve", retour: "OK" },
    { de: "C-api", vers: "C-db", texte: "Insère" },
  ],
  fonctionnalites: ["F-001"],
};
const entities = () => [
  entity("component", "C-api", "c", COMPONENT),
  entity("component", "C-db", "d", DB),
  entity("flow", "P-reserver", "p", {
    id: "P-reserver",
    titre: "Réserver un soin",
    acteur: "Cliente",
  }),
  entity("archflow", "P-reserver", "f", FLOW),
  entity("roles", "roles", "r", { roles: [{ id: "RL-client", nom: "Client" }] }),
];

describe("flux : titre du parcours et recherche", () => {
  it("titre et acteur lus du parcours P- du même identifiant ; q cherche aussi dans le titre du parcours", async () => {
    const s = await readScene(read());
    await seedIndex(read(), s, [], { commit: true, entities: entities() });
    const url = `/projects/${s.projectId}/spec/architecture/flows`;
    const res = await send(read().app, s.world.actors.dev.cookie, "get", url);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items).toEqual([
      {
        specId: "P-reserver",
        title: "Réserver un soin",
        actor: "Cliente",
        componentCount: 2,
        externalCount: 0,
      },
    ]);
    const found = await send(read().app, s.world.actors.dev.cookie, "get", `${url}?q=soin`);
    expect(specIds(found.body)).toEqual(["P-reserver"]);
    const none = await send(read().app, s.world.actors.dev.cookie, "get", `${url}?q=introuvable`);
    expect(none.body.total).toBe(0);
  });

  it("aucune entité indexée : liste vide, jamais d'erreur ; rien d'indexé du tout : liste vide", async () => {
    const s = await readScene(read());
    const res = await send(
      read().app,
      s.world.actors.dev.cookie,
      "get",
      `/projects/${s.projectId}/spec/architecture/flows`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.architecture.source", () => {
  const seeded = async () => {
    const s = await readScene(read());
    const indexed = await seedIndex(read(), s, [], { commit: true, entities: entities() });
    await setEntityPath(read(), indexed.snapshotId, "C-api", "architecture/components/api.yaml");
    await setEntityPath(
      read(),
      indexed.snapshotId,
      "P-reserver",
      "architecture/flows/P-reserver.yaml",
    );
    return { s, ...indexed };
  };
  const call = (
    s: Awaited<ReturnType<typeof seeded>>["s"],
    query: string,
    role: keyof World["actors"] = "dev",
  ) =>
    send(
      read().app,
      s.world.actors[role]?.cookie,
      "get",
      `/projects/${s.projectId}/spec/architecture/source?${query}`,
    );

  it("composant : fichier du dépôt tel qu'écrit (generated: false)", async () => {
    const { s, snapshotId } = await seeded();
    const text = "id: C-api\nnom: API\ntype: service\nzone: Coeur\nresponsabilite: Expose.\n";
    const sha = await commitAtHead(read(), s, snapshotId, [
      { path: "architecture/components/api.yaml", content: text },
    ]);
    const res = await call(s, "target[kind]=component&target[id]=C-api");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      path: "architecture/components/api.yaml",
      text,
      commitSha: sha,
      generated: false,
    });
  });

  it("composant absent du commit : YAML généré depuis l'index (generated: true), pour le designer aussi", async () => {
    const { s, sha } = await seeded();
    const res = await call(s, "target[kind]=component&target[id]=C-api", "designer");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      path: "architecture/components/api.yaml",
      commitSha: sha,
      generated: true,
    });
    expect(res.body.text).toContain("id: C-api");
    expect(res.body.text).toContain("nom: API");
  });

  it("flux : YAML par défaut, Mermaid sur demande ; committés ou générés (acteurs et composants nommés)", async () => {
    const { s, snapshotId } = await seeded();
    const yaml = await call(s, "target[kind]=flow&target[id]=P-reserver");
    expect(yaml.status, JSON.stringify(yaml.body)).toBe(200);
    expect(yaml.body).toMatchObject({
      path: "architecture/flows/P-reserver.yaml",
      generated: true,
    });
    expect(yaml.body.text).toContain("id: P-reserver");
    const mermaid = await call(s, "target[kind]=flow&target[id]=P-reserver&format=mermaid");
    expect(mermaid.body).toMatchObject({
      path: "architecture/flows/P-reserver.mmd",
      generated: true,
    });
    expect(mermaid.body.text).toContain("sequenceDiagram");
    expect(mermaid.body.text).toContain("participant RL_client as Client");
    expect(mermaid.body.text).toContain("participant C_api as API");
    const committed = "sequenceDiagram\n  A->>B: committé\n";
    await commitAtHead(read(), s, snapshotId, [
      { path: "architecture/flows/P-reserver.mmd", content: committed },
    ]);
    const again = await call(s, "target[kind]=flow&target[id]=P-reserver&format=mermaid");
    expect(again.body).toMatchObject({ text: committed, generated: false });
  });

  it("schéma : Mermaid des composants (généré, puis committé)", async () => {
    const { s, snapshotId } = await seeded();
    const generated = await call(s, "target[kind]=schema");
    expect(generated.status, JSON.stringify(generated.body)).toBe(200);
    expect(generated.body).toMatchObject({ path: "architecture/schema.mmd", generated: true });
    expect(generated.body.text).toContain("flowchart");
    expect(generated.body.text).toContain("API");
    const committed = "flowchart LR\n  A --> B\n";
    await commitAtHead(read(), s, snapshotId, [
      { path: "architecture/schema.mmd", content: committed },
    ]);
    const again = await call(s, "target[kind]=schema", "owner");
    expect(again.body).toMatchObject({ text: committed, generated: false });
  });

  it("composant ou flux inconnu : 404 ; cible mal formée ou incohérente : 400", async () => {
    const { s } = await seeded();
    expect((await call(s, "target[kind]=component&target[id]=C-absent")).status).toBe(404);
    expect((await call(s, "target[kind]=flow&target[id]=P-absent")).status).toBe(404);
    expect((await call(s, "target[kind]=component")).status).toBe(400);
    expect((await call(s, "target[kind]=component&target[id]=P-reserver")).status).toBe(400);
    expect((await call(s, "target[kind]=table&target[id]=T-a")).status).toBe(400);
  });

  it.each(["client", "business"] as const)(
    "%s : 403, ni YAML ni Mermaid dans la réponse",
    async (role) => {
      const { s } = await seeded();
      for (const query of [
        "target[kind]=component&target[id]=C-api",
        "target[kind]=flow&target[id]=P-reserver",
        "target[kind]=flow&target[id]=P-reserver&format=mermaid",
        "target[kind]=schema",
      ]) {
        const res = await call(s, query, role);
        expect(res.status, `${role} ${query}`).toBe(403);
        expect(JSON.stringify(res.body)).not.toMatch(/sequenceDiagram|flowchart|id: C-api/);
      }
    },
  );
});
