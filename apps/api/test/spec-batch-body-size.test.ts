import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SPEC_BATCH_MAX_BODY_BYTES } from "../src/spec-batch/spec-batch-body-parser.ts";
import {
  BRANCH,
  batch,
  batchApi,
  createOp,
  installSpecBench,
  specScene,
} from "./helpers/spec-batch.ts";
import { send } from "./helpers/tickets.ts";

/**
 * Staging, 2026-11-12 : « Enregistrer 149 dans la spec » renvoyait 413 « request entity too large » (100 ko
 * d'Express par défaut) avant d'atteindre l'application. La route des lots accepte 4 Mio ; les autres gardent 100 ko.
 */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach });

describe("taille du corps de POST /projects/{projectId}/spec/batches", () => {
  it("un lot de plus de 100 ko (40 fonctionnalités détaillées) est enregistré", async () => {
    const b = bench();
    const s = await specScene(b);
    const operations = Array.from({ length: 40 }, (_, index) =>
      createOp(`Fonctionnalité ${index + 1}`, { description: "Détail. ".repeat(500) }),
    );
    const body = batch(operations, { branch: BRANCH });
    expect(JSON.stringify(body).length).toBeGreaterThan(100 * 1024);

    const res = await batchApi(b.app, s.world.actors.dev).submit(s.projectId, body);

    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    expect(res.body.status).toBe("committed");
  });

  it("au-delà de 4 Mio : 413", async () => {
    const b = bench();
    const s = await specScene(b);
    const body = batch([
      createOp("Trop gros", { description: "x".repeat(SPEC_BATCH_MAX_BODY_BYTES) }),
    ]);

    const res = await batchApi(b.app, s.world.actors.dev).submit(s.projectId, body);

    expect(res.status).toBe(413);
  });

  it("les autres routes gardent la limite de 100 ko", async () => {
    const b = bench();
    const s = await specScene(b);

    const res = await send(
      b.app,
      s.world.actors.dev.cookie,
      "post",
      `/projects/${s.projectId}/visit`,
      {
        filler: "x".repeat(150 * 1024),
      },
    );

    expect(res.status).toBe(413);
  });
});
