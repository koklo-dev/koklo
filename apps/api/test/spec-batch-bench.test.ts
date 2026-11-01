import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installSpecBench } from "./helpers/spec-batch.ts";

/**
 * Le banc `specBatch.*` doit être déterministe : le worker de production planifie `reconcile` toutes
 * les 10 minutes (cron, heure réelle). Un tick pendant un test fait lister les dépôts de la base au
 * faux fournisseur et pollue `harness.calls`. Le banc ne doit donc laisser aucune planification.
 */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach });

describe("banc specBatch : aucun tick planifié", () => {
  it("la file reconcile n'a aucune planification pendant les tests", async () => {
    const rows = await bench().database.query<{ name: string }>("SELECT name FROM pgboss.schedule");
    expect(rows).toEqual([]);
  });

  it("une reprise du worker ne replanifie rien", async () => {
    const b = bench();
    await b.stopWorker();
    await b.startWorker();
    const rows = await b.database.query<{ name: string }>("SELECT name FROM pgboss.schedule");
    expect(rows).toEqual([]);
  });
});
