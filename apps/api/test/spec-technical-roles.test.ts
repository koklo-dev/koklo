import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  batch,
  batchApi,
  batchRows,
  installSpecBench,
  specScene,
  submitOk,
} from "./helpers/spec-batch.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";
import { componentEntity, stackEntity, technicalApi } from "./helpers/spec-technical.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-115 lot B (cas 6, B725) : droits du cahier technique. Lectures `spec.technical.*` (dont `source`) et document :
 * owner, admin, développeur et designer ; client et business 403. « Choisir » et tout lot qui porte une opération
 * technique : owner, admin et développeur (designer 403, refusé par l'API avant tout lot).
 */
const read = installBench({ beforeAll, afterAll, beforeEach });
const write = installSpecBench({ beforeAll, afterAll, beforeEach });

const ROUTES = (p: string) => [
  `/projects/${p}/spec/technical/stack`,
  `/projects/${p}/spec/technical/stack/ST-sms/source`,
  `/projects/${p}/spec/technical/environments`,
  `/projects/${p}/spec/document/sections?deliverable=technical`,
  `/projects/${p}/spec/items/stack/ST-sms`,
];

async function seeded() {
  const s = await readScene(read());
  await seedIndex(read(), s, [], {
    commit: true,
    entities: [stackEntity("ST-sms"), componentEntity("C-sms")],
  });
  return s;
}

describe("lectures du cahier technique", () => {
  it.each(["owner", "admin", "dev", "designer"] as const)("%s lit", async (role) => {
    const s = await seeded();
    for (const path of ROUTES(s.projectId)) {
      const res = await send(read().app, s.world.actors[role].cookie, "get", path);
      expect(res.status, `${role} ${path} ${JSON.stringify(res.body)}`).toBe(200);
    }
  });

  it.each(["client", "business"] as const)("%s : 403, rien d'indexé divulgué", async (role) => {
    const s = await seeded();
    for (const path of ROUTES(s.projectId)) {
      const res = await send(read().app, s.world.actors[role].cookie, "get", path);
      expect(res.status, `${role} ${path}`).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      expect(JSON.stringify(res.body)).not.toMatch(/SMS|Brevo|yaml/i);
    }
  });

  it("projet hors de l'organisation : 404", async () => {
    const s = await seeded();
    const res = await technicalApi(read().app, s.world.actors.dev).stack(
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect(res.status).toBe(404);
  });
});

const TECHNICAL_OPERATIONS = [
  { kind: "stack.delete", specId: "ST-sms" },
  { kind: "op.delete", specId: "avis.create" },
  { kind: "nfr.delete", specId: "NFR-001" },
  { kind: "env.delete", specId: "ENV-recette" },
  { kind: "doc.section.create", deliverable: "technical", title: "Objet", markdown: "But." },
];

describe("écritures du cahier technique", () => {
  it.each(["designer", "client", "business"] as const)(
    "%s : 403 sur « Choisir » et sur tout lot technique, aucun lot",
    async (role) => {
      const b = write();
      const s = await specScene(b);
      const actor = s.world.actors[role];
      const chosen = await technicalApi(b.app, actor).choose(s.projectId, "ST-sms", "Brevo");
      expect(chosen.status, role).toBe(403);
      for (const operation of TECHNICAL_OPERATIONS) {
        const res = await batchApi(b.app, actor).submit(s.projectId, batch([operation]));
        expect(res.status, `${role} ${operation.kind}`).toBe(403);
        expect(res.body.code).toBe("FORBIDDEN");
      }
      expect(await batchRows(b.database, s.projectId)).toHaveLength(0);
    },
  );

  it.each(["owner", "admin", "dev"] as const)("%s écrit un choix", async (role) => {
    const b = write();
    const s = await specScene(b);
    const body = await submitOk(
      b,
      s,
      [{ kind: "stack.create", role: "Base", status: "open", options: ["A", "B"], why: "x" }],
      {},
      role,
    );
    expect(body.results).toEqual([{ position: 0, kind: "stack.create", specId: "ST-base" }]);
  });

  it("le designer écrit toujours une section de l'architecture : le refus ne vise que le technique", async () => {
    const b = write();
    const s = await specScene(b);
    const res = await batchApi(b.app, s.world.actors.designer).submit(
      s.projectId,
      batch([{ kind: "doc.section.create", title: "Contexte", markdown: "x" }]),
    );
    expect(res.body.code).not.toBe("VALIDATION");
    expect(await batchRows(b.database, s.projectId)).toHaveLength(1);
  });
});
