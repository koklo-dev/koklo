import { randomUUID } from "node:crypto";
import { DELIVERABLE_KEYS } from "@koklo/contract";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { stripRequestId } from "./helpers/client-scene.ts";
import { freezeIdea, insertProposal } from "./helpers/proposals.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { deliverablesApi } from "./helpers/spec-deliverables.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";
import { createWorld, insertProject, linkClient, type World } from "./helpers/tickets.ts";

/**
 * TK-100 lot A : `spec.deliverables`, GET /projects/{projectId}/spec/deliverables. Sept entrées dans l'ordre, disponibilité
 * B1 calculée par le domaine, condition, propositions en attente lues dans `agent_proposals` (0 pour le client), accès par
 * projet (404 uniforme). Le statut vient de la source de statuts : lot A, Fonctionnel seul.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
const FEATURES = [{ id: "F-001" }, { id: "F-002" }];

type Entry = {
  key: string;
  status: string;
  available: boolean;
  forced: boolean;
  condition: string | null;
  pendingProposals: number;
  staleBecause?: unknown;
};
const listOf = (world: World, role: keyof World["actors"] = "dev", projectId = world.projectId) =>
  deliverablesApi(bench().app, world.actors[role]).list(projectId);
const byKey = (body: { deliverables: Entry[] }) =>
  Object.fromEntries(body.deliverables.map((entry) => [entry.key, entry]));

async function worldWithFeatures() {
  const scene = await readScene(bench());
  await seedIndex(bench(), scene, FEATURES);
  return scene;
}

describe("sept entrées dans l'ordre", () => {
  it("renvoie les sept livrables dans l'ordre de DELIVERABLE_KEYS, tous à faire sans rien", async () => {
    const world = await createWorld(bench().database);
    const res = await listOf(world);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.deliverables.map((entry: Entry) => entry.key)).toEqual([...DELIVERABLE_KEYS]);
    expect(res.body.deliverables.map((entry: Entry) => entry.status)).toEqual(
      DELIVERABLE_KEYS.map(() => "todo"),
    );
    expect(res.body.validatedCount).toBe(0);
  });

  it("chaque entrée ne porte que les champs du contrat ; staleBecause absent tant qu'aucune idée n'a changé", async () => {
    const world = await createWorld(bench().database);
    const { body } = await listOf(world);
    for (const entry of body.deliverables) {
      expect(Object.keys(entry).sort(), entry.key).toEqual([
        "available",
        "condition",
        "forced",
        "key",
        "pendingProposals",
        "status",
      ]);
    }
    expect(Object.keys(body).sort()).toEqual(["deliverables", "validatedCount"]);
  });
});

describe("disponibilité B1", () => {
  it("projet sans idée figée ni fonctionnalité : tout est fermé et dit après quoi il s'ouvre", async () => {
    const world = await createWorld(bench().database);
    const entries = byKey((await listOf(world)).body);
    for (const entry of Object.values(entries)) expect(entry.available, entry.key).toBe(false);
    expect(entries.functional?.condition).toBe("Disponible après la première version de l'idée");
    expect(entries.data?.condition).toBe("Disponible après le fonctionnel");
    expect(entries.architecture?.condition).toBe("Disponible après les données");
    expect(entries.technical?.condition).toBe("Disponible après l'architecture");
    expect(entries.security?.condition).toBe("Disponible après le technique");
    expect(entries.design?.condition).toBe("Disponible après le fonctionnel");
    expect(entries.quality?.condition).toBe(
      "Disponible après le technique, la sécurité et le design",
    );
  });

  it("idea-v1 commitée : le Fonctionnel s'ouvre, Données et Design restent fermés", async () => {
    const scene = await readScene(bench());
    await freezeIdea(bench().database, scene);
    const entries = byKey((await listOf(scene.world)).body);
    expect(entries.functional).toMatchObject({ available: true, condition: null });
    expect(entries.data?.available).toBe(false);
    expect(entries.design?.available).toBe(false);
  });

  it("une version dont le lot n'est pas commité n'ouvre rien", async () => {
    const scene = await readScene(bench());
    await bench().database.query(
      `INSERT INTO idea_versions (id, organization_id, project_id, number, tag, pages_versions, frozen_at, updated_at)
       VALUES ($1, $2, $3, 1, 'idea-v1', '{}'::jsonb, now(), now())`,
      [randomUUID(), scene.organizationId, scene.projectId],
    );
    expect(byKey((await listOf(scene.world)).body).functional?.available).toBe(false);
  });

  it("fonctionnalités indexées : Fonctionnel, Données et Design ouverts, les quatre autres fermés", async () => {
    const scene = await worldWithFeatures();
    const entries = byKey((await listOf(scene.world)).body);
    const open = Object.values(entries)
      .filter((entry) => entry.available)
      .map((entry) => entry.key);
    expect(open).toEqual(["functional", "data", "design"]);
    expect(entries.data?.condition).toBeNull();
  });

  it("le Fonctionnel dont les fonctionnalités ne sont pas jugées est « À valider » ; Données reste à faire", async () => {
    const scene = await worldWithFeatures();
    const { body } = await listOf(scene.world);
    expect(byKey(body).functional?.status).toBe("pending");
    expect(byKey(body).data?.status).toBe("todo");
    expect(body.validatedCount).toBe(0);
  });
});

describe("propositions en attente", () => {
  async function seeded() {
    const scene = await worldWithFeatures();
    const { database } = bench();
    const scope = { ...scene, userId: scene.world.actors.dev.userId };
    await insertProposal(database, scope);
    await insertProposal(database, scope);
    await insertProposal(database, scope, { status: "accepted" });
    const { id } = await insertProposal(database, scope);
    await database.query("UPDATE agent_proposals SET deliverable = 'data' WHERE id = $1", [id]);
    return scene;
  }

  it("l'équipe reçoit le nombre de propositions en attente par livrable (les décidées ne comptent pas)", async () => {
    const scene = await seeded();
    for (const role of ["owner", "admin", "dev", "designer", "business"] as const) {
      const entries = byKey((await listOf(scene.world, role)).body);
      expect(entries.functional?.pendingProposals, role).toBe(2);
      expect(entries.data?.pendingProposals, role).toBe(1);
      expect(entries.quality?.pendingProposals, role).toBe(0);
    }
  });

  it("le client ne voit jamais de propositions : 0 partout", async () => {
    const scene = await seeded();
    const { database } = bench();
    await linkClient(
      database,
      scene.organizationId,
      scene.projectId,
      scene.world.actors.client.userId,
    );
    const res = await listOf(scene.world, "client");
    expect(res.status).toBe(200);
    for (const entry of res.body.deliverables) expect(entry.pendingProposals, entry.key).toBe(0);
  });

  it("les propositions d'un autre projet ne comptent pas", async () => {
    const scene = await seeded();
    const other = await insertProject(bench().database, scene.organizationId, "Autre");
    const res = await listOf(scene.world, "dev", other);
    expect(res.status).toBe(200);
    for (const entry of res.body.deliverables) expect(entry.pendingProposals, entry.key).toBe(0);
  });
});

describe("accès par projet", () => {
  it("projet inconnu, projet d'une autre organisation et client non lié : même 404", async () => {
    const world = await createWorld(bench().database, { linkedClient: false });
    const foreign = await createWorld(bench().database);
    const unknown = "99999999-9999-4999-8999-999999999999";
    const refusals = [
      await listOf(world, "dev", unknown),
      await listOf(world, "dev", foreign.projectId),
      await listOf(world, "client"),
    ];
    for (const res of refusals) {
      expect(res.status, JSON.stringify(res.body)).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
    const [first, ...rest] = refusals.map((r) => JSON.stringify(stripRequestId(r.body)));
    for (const other of rest) expect(other).toBe(first);
  });

  it("sans session : 401", async () => {
    const world = await createWorld(bench().database);
    expect((await deliverablesApi(bench().app, undefined).list(world.projectId)).status).toBe(401);
  });

  it("tout rôle ayant accès reçoit 200, le client lié compris", async () => {
    const world = await createWorld(bench().database);
    for (const role of ["owner", "admin", "dev", "designer", "business", "client"] as const) {
      const res = await listOf(world, role);
      expect(res.status, `${role} : ${JSON.stringify(res.body)}`).toBe(200);
    }
  });
});
