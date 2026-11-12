import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { DELIVERABLE_KEYS, shellApi } from "./helpers/shell.ts";
import { deliverablesApi, forceWithBearer, overrideRows } from "./helpers/spec-deliverables.ts";
import { auditRows, createWorld, insertProject, type World } from "./helpers/tickets.ts";

/**
 * TK-100 lot A : `spec.forceDeliverable`, POST /projects/{projectId}/spec/deliverables/{key}/force. Owner et admin seulement
 * (403 pour dev, designer, business, client et jeton d'agent), `confirm: true`, idempotent, audité `deliverable.force`.
 * Un forçage ouvre le livrable sans rien valider.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
type Role = keyof World["actors"];
const forceAs = (world: World, role: Role, key = "architecture", over = {}) =>
  deliverablesApi(bench().app, world.actors[role]).force(world.projectId, key, over);
const forcedAudit = async (world: World) =>
  (await auditRows(bench().database, world.organizationId)).filter(
    (row) => row.action === "deliverable.force",
  );

describe("droits : owner et admin seulement", () => {
  it.each(["owner", "admin"] as const)("%s : 200, entrée forcée et ouverte", async (role) => {
    const world = await createWorld(bench().database);
    const res = await forceAs(world, role);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      key: "architecture",
      available: true,
      forced: true,
      status: "todo",
      condition: null,
    });
    const rows = await overrideRows(bench().database, world.projectId);
    expect(rows).toEqual([
      { id: expect.any(String), deliverable: "architecture", forced_by: world.actors[role].userId },
    ]);
  });

  it.each(["dev", "designer", "business", "client"] as const)(
    "%s : 403 FORBIDDEN, rien n'est écrit ni audité",
    async (role) => {
      const world = await createWorld(bench().database);
      const res = await forceAs(world, role);
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      expect(await overrideRows(bench().database, world.projectId)).toEqual([]);
      expect(await forcedAudit(world)).toEqual([]);
    },
  );

  it("jeton d'agent (Authorization: Bearer) sans session : refusé, rien n'est écrit", async () => {
    const world = await createWorld(bench().database);
    const res = await forceWithBearer(bench().app, world.projectId, "architecture");
    expect([401, 403]).toContain(res.status);
    expect(await overrideRows(bench().database, world.projectId)).toEqual([]);
  });

  it("sans session : 401", async () => {
    const world = await createWorld(bench().database);
    const res = await deliverablesApi(bench().app, undefined).force(world.projectId, "data");
    expect(res.status).toBe(401);
  });
});

describe("entrée, accès par projet et idempotence", () => {
  it.each([{ confirm: false }, { confirm: "true" }, { confirm: undefined }])(
    "confirm %j : refusé, rien n'est écrit",
    async (over) => {
      const world = await createWorld(bench().database);
      const res = await forceAs(world, "owner", "data", over);
      expect([400, 422]).toContain(res.status);
      expect(await overrideRows(bench().database, world.projectId)).toEqual([]);
    },
  );

  it("clé inconnue : refusée", async () => {
    const world = await createWorld(bench().database);
    const res = await forceAs(world, "owner", "screens");
    expect([400, 404, 422]).toContain(res.status);
    expect(await overrideRows(bench().database, world.projectId)).toEqual([]);
  });

  it("projet d'une autre organisation ou inconnu : 404 uniforme, rien n'est écrit", async () => {
    const world = await createWorld(bench().database);
    const foreign = await createWorld(bench().database);
    const api = deliverablesApi(bench().app, world.actors.owner);
    for (const projectId of [foreign.projectId, "99999999-9999-4999-8999-999999999999"]) {
      const res = await api.force(projectId, "data");
      expect(res.status, JSON.stringify(res.body)).toBe(404);
    }
    expect(await overrideRows(bench().database, foreign.projectId)).toEqual([]);
  });

  it("idempotent : un second forçage répond 200 à l'identique, sans doublon ni second audit", async () => {
    const world = await createWorld(bench().database);
    const first = await forceAs(world, "owner");
    const second = await forceAs(world, "admin");
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await overrideRows(bench().database, world.projectId)).toHaveLength(1);
    expect(await forcedAudit(world)).toHaveLength(1);
  });
});

describe("audit et effets", () => {
  it("journalise deliverable.force par l'acteur, sur la ligne de forçage, sans texte libre", async () => {
    const world = await createWorld(bench().database);
    await forceAs(world, "admin", "technical");
    const [row] = await overrideRows(bench().database, world.projectId);
    const entries = await forcedAudit(world);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "deliverable.force",
      target_kind: "deliverable_override",
      target_id: row?.id,
      actor_id: world.actors.admin.userId,
      ticket_id: null,
    });
  });

  it("ouvre sans rien valider : le statut reste à faire, le compteur à 0, les autres livrables inchangés", async () => {
    const world = await createWorld(bench().database);
    await forceAs(world, "owner", "technical");
    const { body } = await deliverablesApi(bench().app, world.actors.dev).list(world.projectId);
    const entries = Object.fromEntries(
      body.deliverables.map((entry: { key: string }) => [entry.key, entry]),
    );
    expect(entries.technical).toMatchObject({ available: true, forced: true, status: "todo" });
    expect(entries.security).toMatchObject({ available: false, forced: false });
    expect(entries.architecture).toMatchObject({ available: false, forced: false });
    expect(body.validatedCount).toBe(0);
  });

  it("le forçage d'un projet ne touche pas un autre projet de l'organisation", async () => {
    const world = await createWorld(bench().database);
    const other = await insertProject(bench().database, world.organizationId, "Autre");
    await forceAs(world, "owner", "data");
    const { body } = await deliverablesApi(bench().app, world.actors.owner).list(other);
    expect(body.deliverables.every((entry: { forced: boolean }) => !entry.forced)).toBe(true);
  });

  it("project.shell lit le service : le livrable forcé y est disponible, validatedCount reste 0", async () => {
    const world = await createWorld(bench().database);
    await forceAs(world, "owner", "quality");
    const { body } = await shellApi(bench().app, world.actors.dev).shell(world.projectId);
    expect(body.deliverables.map((d: { key: string }) => d.key)).toEqual([...DELIVERABLE_KEYS]);
    const open = body.deliverables.filter((d: { available: boolean }) => d.available);
    expect(open.map((d: { key: string }) => d.key)).toEqual(["quality"]);
    expect(body.validatedCount).toBe(0);
  });
});
