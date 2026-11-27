import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commentsFor } from "./helpers/comments.ts";
import { proposalApi } from "./helpers/proposals.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { batchApi } from "./helpers/spec-batch.ts";
import { deliverablesApi } from "./helpers/spec-deliverables.ts";
import { itemApi } from "./helpers/spec-items.ts";
import { specReadApi } from "./helpers/spec-read.ts";
import {
  asvsEntity,
  clearedSeeds,
  rightsEntity,
  securityApi,
  securityScene,
  summaryEntity,
  threatEntity,
} from "./helpers/spec-security.ts";
import { createWorld, linkClient, send } from "./helpers/tickets.ts";

/**
 * TK-117 lot B (cas 5, B810, modèle de menace 1 et 2) : droits sur la Sécurité. Lecture par owner, admin, développeur et
 * designer ; écriture, propositions et validation par owner, admin et développeur ; client et business 403 partout, avant
 * même le contrôle de projet ; autre organisation 404 ; aucune voie générique ne rend le modèle de menaces.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });

const SECRET_TITLE = "Export confidentiel du fichier";
const scene = async () => {
  const s = await securityScene(bench(), [
    ...clearedSeeds({ threats: [threatEntity("SEC-T01", { titre: SECRET_TITLE })] }),
    rightsEntity(),
    asvsEntity(),
    summaryEntity(),
  ]);
  await linkClient(bench().database, s.organizationId, s.projectId, s.world.actors.client.userId);
  return s;
};
type Scene = Awaited<ReturnType<typeof scene>>;
type Role = keyof Scene["world"]["actors"];
const api = (s: Scene, role: Role) => securityApi(bench().app, s.world.actors[role]);
const UNKNOWN = "123e4567-e89b-42d3-a456-426614174000";

const READS = (s: Scene, role: Role, p: string) => {
  const a = api(s, role);
  return {
    threats: () => a.threats(p),
    threat: () => a.threat(p, "SEC-T01"),
    data: () => a.data(p),
    registry: () => a.registry(p),
    rights: () => a.rights(p),
    asvs: () => a.asvs(p),
    summary: () => a.summary(p),
  };
};
const WRITES = (s: Scene, role: Role, p: string) => {
  const a = api(s, role);
  return {
    createThreat: () => a.createThreat(p),
    updateThreat: () => a.updateThreat(p, "SEC-T01", { severity: "low" }),
    classify: () => a.classify(p, { id: "clientes.telephone", retention: "1 an" }),
    setLevel: () => a.setLevel(p, 3),
    propose: () => a.propose(p),
    accept: () => a.accept(p, UNKNOWN),
    validate: () => a.validate(p, s.sha),
  };
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même garde, un test par voie
describe("droits sur security.*", () => {
  it.each(["client", "business"] as const)(
    "%s : 403 sur chaque procédure, sur son projet comme sur un projet inconnu",
    async (role) => {
      const s = await scene();
      for (const project of [s.projectId, UNKNOWN]) {
        const calls = { ...READS(s, role, project), ...WRITES(s, role, project) };
        for (const [name, call] of Object.entries(calls)) {
          const res = await call();
          expect(res.status, `${role} ${name}`).toBe(403);
          expect(JSON.stringify(res.body)).not.toContain(SECRET_TITLE);
        }
      }
    },
  );

  it("designer : lit tout, 403 sur chaque écriture", async () => {
    const s = await scene();
    for (const [name, call] of Object.entries(READS(s, "designer", s.projectId))) {
      expect((await call()).status, name).toBe(200);
    }
    for (const [name, call] of Object.entries(WRITES(s, "designer", s.projectId))) {
      expect((await call()).status, name).toBe(403);
    }
    const [count] = await bench().database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM spec_write_batches WHERE project_id = $1",
      [s.projectId],
    );
    expect(count?.n).toBe(0);
  });

  it("autre organisation : 404 sur le projet d'un autre (lecture et écriture)", async () => {
    const s = await scene();
    const foreign = await createWorld(bench().database, { linkedClient: false });
    const intruder = securityApi(bench().app, foreign.actors.owner);
    for (const res of [
      await intruder.threats(s.projectId),
      await intruder.threat(s.projectId, "SEC-T01"),
      await intruder.registry(s.projectId),
      await intruder.createThreat(s.projectId),
      await intruder.validate(s.projectId, s.sha),
    ]) {
      expect(res.status).toBe(404);
    }
    // Le projet de l'intrus ne voit rien de la tête du premier (portée par projet).
    const own = await intruder.threats(foreign.projectId);
    expect(own.status).toBe(200);
    expect(own.body.items).toHaveLength(0);
  });

  it.each(["client", "business"] as const)(
    "%s : aucune voie générique (panneau, références, document, propositions, IA, lots, commentaires)",
    async (role) => {
      const s = await scene();
      const actor = s.world.actors[role];
      const items = itemApi(bench().app, actor);
      const proposals = proposalApi(bench().app, actor);
      const get = (path: string) =>
        send(bench().app, actor.cookie, "get", `/projects/${s.projectId}${path}`);
      for (const res of [
        await items.get(s.projectId, "SEC-T01", "threat"),
        await items.get(s.projectId, "clientes.telephone", "sensitive"),
        await items.search(s.projectId, ["feature"], "Export"),
        await get("/spec/document/sections?deliverable=security"),
        await proposals.list(s.projectId, { deliverable: "security", groupBy: "type" }),
        await proposals.options(s.projectId, "security"),
        await proposals.propose(s.projectId, { deliverable: "security", mode: "threats" }),
        await send(bench().app, actor.cookie, "post", `/projects/${s.projectId}/ai/item/prefill`, {
          projectId: s.projectId,
          type: "threat",
          description: "Un abus",
        }),
        await batchApi(bench().app, actor).submit(s.projectId, {
          idempotencyKey: "secu-x",
          operations: [{ kind: "threat.delete", specId: "SEC-T01" }],
        }),
        await commentsFor(bench().app, actor, s.projectId).listOnTable("T-clientes"),
      ]) {
        expect(res.status).toBe(403);
      }
    },
  );

  it("designer : lit le panneau et le document, 403 sur propositions, préremplissage et lots", async () => {
    const s = await scene();
    const actor = s.world.actors.designer;
    const item = await itemApi(bench().app, actor).get(s.projectId, "SEC-T01", "threat");
    expect(item.status, JSON.stringify(item.body)).toBe(200);
    expect(item.body).toMatchObject({ type: "threat", validated: false });
    const entry = await itemApi(bench().app, actor).get(
      s.projectId,
      "clientes.telephone",
      "sensitive",
    );
    expect(entry.body.values).toMatchObject({ retention: "3 ans", category: "contact" });
    const document = await send(
      bench().app,
      actor.cookie,
      "get",
      `/projects/${s.projectId}/spec/document/sections?deliverable=security`,
    );
    expect(document.status, JSON.stringify(document.body)).toBe(200);
    const proposals = proposalApi(bench().app, actor);
    for (const res of [
      await proposals.list(s.projectId, { deliverable: "security", groupBy: "type" }),
      await proposals.options(s.projectId, "security"),
      await proposals.propose(s.projectId, { deliverable: "security", mode: "threats" }),
      await send(bench().app, actor.cookie, "post", `/projects/${s.projectId}/ai/item/prefill`, {
        projectId: s.projectId,
        type: "sensitive",
        description: "Une photo",
      }),
      await batchApi(bench().app, actor).submit(s.projectId, {
        idempotencyKey: "secu-d",
        operations: [{ kind: "summary.update", incident: "x" }],
      }),
    ]) {
      expect(res.status).toBe(403);
    }
  });

  it("les voies ouvertes à tous ne disent rien de la Sécurité", async () => {
    const s = await scene();
    for (const role of ["client", "business"] as const) {
      const actor = s.world.actors[role];
      const listed = await deliverablesApi(bench().app, actor).list(s.projectId);
      expect(listed.status).toBe(200);
      const security = listed.body.deliverables.find((d: { key: string }) => d.key === "security");
      expect(security.staleSecurity).toBeUndefined();
      expect(security.pendingProposals).toBe(0);
      expect(JSON.stringify(listed.body)).not.toContain("SEC-T");
    }
    const head = await specReadApi(bench().app, s.world.actors.business).head(s.projectId);
    expect(Object.keys(head.body.counts).join()).not.toMatch(/threat|sensitive|secur|asvs/i);
    for (const path of [
      "/search?q=confidentiel",
      `/search?q=confidentiel&projectId=${s.projectId}`,
      "/me/notifications",
      `/projects/${s.projectId}/overview`,
    ]) {
      const res = await send(bench().app, s.world.actors.business.cookie, "get", path);
      expect(JSON.stringify(res.body)).not.toContain(SECRET_TITLE);
    }
  });
});
