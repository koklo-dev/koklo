import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  BRANCH,
  batch,
  batchApi,
  batchRows,
  fileOf,
  installSpecBench,
  specScene,
  submitOk,
} from "./helpers/spec-batch.ts";
import { entity, readScene, seedIndex } from "./helpers/spec-read.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-107 lot A (B389) : droits de la page Données. Lectures `spec.data.*` et `spec.item.get` de type table : owner, admin,
 * développeur et designer ; client et business 403. Écritures `table.*` et `fixture.create` de `specBatch.submit` : owner,
 * admin et développeur ; le designer lit mais reçoit FORBIDDEN (rien n'est commité) ; client et business 403.
 */
const read = installBench({ beforeAll, afterAll, beforeEach });
const write = installSpecBench({ beforeAll, afterAll, beforeEach });

const TABLE = {
  id: "T-client",
  titre: "Client",
  nom: "Client",
  champs: [{ nom: "id", type: "uuid" }],
};
const ROUTES = (s: { projectId: string }) => [
  `/projects/${s.projectId}/spec/data/tables`,
  `/projects/${s.projectId}/spec/data/mermaid`,
  `/projects/${s.projectId}/spec/data/fixtures`,
  `/projects/${s.projectId}/spec/data/fixtures/FX-clients/rows?page=1&size=25`,
  `/projects/${s.projectId}/spec/items/table/T-client`,
];

describe("lectures de la page Données", () => {
  it.each(["owner", "admin", "dev", "designer"] as const)(
    "%s lit les tables, le modèle et les jeux",
    async (role) => {
      const s = await readScene(read());
      await seedIndex(read(), s, [], {
        commit: true,
        entities: [
          entity("table", "T-client", "c", TABLE),
          entity("fixture", "FX-clients", "f", {
            id: "FX-clients",
            titre: "Clients",
            table: "T-client",
            locale: "fr-FR",
            lignes: [{ id: "a" }],
          }),
        ],
      });
      for (const path of ROUTES(s)) {
        const res = await send(read().app, s.world.actors[role].cookie, "get", path);
        expect(res.status, `${role} ${path} ${JSON.stringify(res.body)}`).toBe(200);
      }
    },
  );

  it.each(["client", "business"] as const)(
    "%s reçoit 403 sur chacune des cinq lectures",
    async (role) => {
      const s = await readScene(read());
      await seedIndex(read(), s, [], {
        commit: true,
        entities: [entity("table", "T-client", "c", TABLE)],
      });
      for (const path of ROUTES(s)) {
        const res = await send(read().app, s.world.actors[role].cookie, "get", path);
        expect(res.status, `${role} ${path}`).toBe(403);
        expect(res.body.code).toBe("FORBIDDEN");
      }
    },
  );

  it("hors du projet de l'organisation : 404, jamais 403", async () => {
    const s = await readScene(read());
    const res = await send(
      read().app,
      s.world.actors.dev.cookie,
      "get",
      "/projects/123e4567-e89b-42d3-a456-426614174000/spec/data/tables",
    );
    expect(res.status).toBe(404);
  });
});

const table = (name: string) => ({
  kind: "table.create",
  name,
  zone: "Clients",
  fields: [{ name: "id", type: "uuid", primaryKey: true }],
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("écritures : table.create et fixture.create par specBatch.submit", () => {
  it.each(["owner", "admin", "dev"] as const)(
    "%s écrit une table : fichier et model.mmd dans UN commit",
    async (role) => {
      const b = write();
      const s = await specScene(b);

      const body = await submitOk(b, s, [table("Client")], {}, role);

      expect(body.status).toBe("committed");
      expect(body.results).toEqual([{ position: 0, kind: "table.create", specId: "T-client" }]);
      const file = await fileOf(b, s, "data/tables/client.yaml");
      expect(file.content).toContain("id: T-client");
      expect((await fileOf(b, s, "data/model.mmd")).content).toContain("T_client {");
      expect(file.ref).toBe((await fileOf(b, s, "data/model.mmd")).ref);
      expect((await fileOf(b, s, "data/tables/client.yaml")).ref).toBe(body.commitSha);
    },
  );

  it("un jeu d'exemple sur la table créée dans le même lot : écrit FX-<slug>.yaml, identifiant posé par le serveur", async () => {
    const b = write();
    const s = await specScene(b);
    const body = await submitOk(b, s, [
      table("Client"),
      {
        kind: "fixture.create",
        title: "Clients de démo",
        table: "T-client",
        rows: [{ id: "c-1" }],
      },
    ]);
    expect(body.results.map((r) => r.specId)).toEqual(["T-client", "FX-clients-de-demo"]);
    expect((await fileOf(b, s, "data/fixtures/FX-clients-de-demo.yaml")).content).toContain("c-1");
  });

  it("collision de nom : write_conflict (409), rien n'est écrit de plus", async () => {
    const b = write();
    const s = await specScene(b);
    await submitOk(b, s, [table("Client")]);
    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([table("Client")], { branch: BRANCH }),
    );
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SPEC_BATCH_CONFLICT");
    expect(res.body.data.reason).toBe("write_conflict");
  });

  it("table.delete d'une table visée : SPEC_INVALID (422)", async () => {
    const b = write();
    const s = await specScene(b);
    await submitOk(b, s, [
      table("Client"),
      {
        kind: "table.create",
        name: "Reservation",
        zone: "Clients",
        fields: [{ name: "client_id", type: "ref(T-client)" }],
        relations: [{ to: "T-client", cardinality: "n → 1" }],
      },
    ]);
    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([{ kind: "table.delete", specId: "T-client" }], { branch: BRANCH }),
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("SPEC_INVALID");
  });

  it("le designer reçoit 403 FORBIDDEN : aucun fichier, aucun commit", async () => {
    const b = write();
    const s = await specScene(b);
    const before = await batchRows(b.database, s.projectId);
    for (const operation of [
      table("Client"),
      { kind: "fixture.create", title: "Jeu", table: "T-x", rows: [] },
    ]) {
      const res = await batchApi(b.app, s.world.actors.designer).submit(
        s.projectId,
        batch([operation], { branch: BRANCH }),
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
    expect(before).toEqual([]);
    await expect(fileOf(b, s, "data/tables/client.yaml")).rejects.toThrow();
  });

  it.each(["client", "business"] as const)("%s reçoit 403 : aucun lot enregistré", async (role) => {
    const b = write();
    const s = await specScene(b);
    const res = await batchApi(b.app, s.world.actors[role]).submit(
      s.projectId,
      batch([table("Client")], { branch: BRANCH }),
    );
    expect(res.status).toBe(403);
    expect(await batchRows(b.database, s.projectId)).toEqual([]);
  });
});
