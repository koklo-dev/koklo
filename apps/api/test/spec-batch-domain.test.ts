import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BRANCH,
  batch,
  batchApi,
  batchRows,
  commitsOf,
  fileOf,
  filesOf,
  headOf,
  installSpecBench,
  specScene,
  submitOk,
} from "./helpers/spec-batch.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-103 lot A (B339, B340) : écritures de règles, de rôles et de parcours par `specBatch.submit` : identifiants posés par
 * le serveur (compteur `rule`, `RL-`/`P-` d'après le texte), fichiers du worker, collision en `write_conflict`, droits
 * (client et business 403 partout ; designer : parcours oui, règles et rôles FORBIDDEN). Base réelle, pg-boss, worker.
 */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach });

const rule = (title: string, over: Record<string, unknown> = {}) => ({
  kind: "rule.create",
  title,
  type: "contrainte",
  statement: `Énoncé de ${title}.`,
  ...over,
});
const role = (name: string) => ({
  kind: "role.create",
  name,
  description: `Rôle ${name}.`,
  permissions: [{ id: "PM-agenda.lire" }, { id: "PM-agenda.modifier", restriction: "les siennes" }],
});
const flow = (title: string) => ({
  kind: "flow.create",
  title,
  actor: "Visiteur",
  start: { label: "Ouvrir la page" },
  steps: [{ label: "Remplir" }, { label: "Confirmer" }],
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("règles : compteur rule", () => {
  it("deux lots concurrents obtiennent deux numéros distincts, relevés par le compteur du projet", async () => {
    const b = bench();
    const s = await specScene(b);
    const api = batchApi(b.app, s.world.actors.dev);
    const [first, second] = await Promise.all([
      api.submit(s.projectId, batch([rule("Délai de rétractation")], { branch: BRANCH })),
      api.submit(s.projectId, batch([rule("Plafond de paiement")], { branch: BRANCH })),
    ]);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    const ids = [first.body.results[0].specId, second.body.results[0].specId].sort();
    expect(ids).toEqual(["R-001", "R-002"]);
    const files = await filesOf(b, s);
    expect(files).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^domain\/rules\/R-001-.+\.md$/),
        expect.stringMatching(/^domain\/rules\/R-002-.+\.md$/),
      ]),
    );
    const [counter] = await b.database.query<{ last_value: number }>(
      "SELECT last_value FROM project_counters WHERE project_id = $1 AND name = 'rule'",
      [s.projectId],
    );
    expect(counter?.last_value).toBe(2);
  });

  it("create, update puis delete : le fichier suit, le rapport reste vide", async () => {
    const b = bench();
    const s = await specScene(b);
    const created = await submitOk(b, s, [rule("Délai", { states: ["A", "B"], type: "workflow" })]);
    const id = created.results[0]?.specId as string;
    expect(id).toMatch(/^R-\d{3}$/);
    const path = (await filesOf(b, s)).find((p) => p.startsWith(`domain/rules/${id}-`)) as string;
    expect((await fileOf(b, s, path)).content).toContain("etats: [A, B]");
    await submitOk(b, s, [{ kind: "rule.update", specId: id, statement: "Nouvel énoncé." }]);
    expect((await fileOf(b, s, path)).content).toContain("Nouvel énoncé.");
    await submitOk(b, s, [{ kind: "rule.delete", specId: id }]);
    expect(await filesOf(b, s)).not.toContain(path);
  });

  it("une règle qui cite F-999 : SPEC_INVALID, rien n'est commité", async () => {
    const b = bench();
    const s = await specScene(b);
    const head = await headOf(b, s);
    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([rule("Cite", { features: ["F-999"] })], { branch: BRANCH }),
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("SPEC_INVALID");
    expect(res.body.data.report.issues.map((i: { code: string }) => i.code)).toContain(
      "R4_UNKNOWN_FEATURE",
    );
    expect(await headOf(b, s)).toBe(head);
    expect((await commitsOf(b, s))[0]?.sha).toBe(head);
  });
});

describe("rôles et parcours : identifiants d'après le texte", () => {
  it("role.create pose RL-<slug du nom> ; le même nom ensuite : write_conflict", async () => {
    const b = bench();
    const s = await specScene(b);
    const created = await submitOk(b, s, [role("Chef d'agence")]);
    expect(created.results[0]?.specId).toBe("RL-chef-d-agence");
    expect((await fileOf(b, s, "domain/roles.yaml")).content).toContain("RL-chef-d-agence");
    const again = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([role("Chef d'agence")], { branch: BRANCH }),
    );
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("SPEC_BATCH_CONFLICT");
    expect(again.body.data.reason).toBe("write_conflict");
  });

  it("flow.create pose P-<slug du titre> et écrit design/flows/P-<slug>.yaml", async () => {
    const b = bench();
    const s = await specScene(b);
    const created = await submitOk(b, s, [flow("Inscription d'un visiteur")]);
    expect(created.results[0]?.specId).toBe("P-inscription-d-un-visiteur");
    expect(await filesOf(b, s)).toContain("design/flows/P-inscription-d-un-visiteur.yaml");
  });
});

describe("droits (B340)", () => {
  it("le designer écrit un parcours, mais ni règle ni rôle (FORBIDDEN, rien n'est commité)", async () => {
    const b = bench();
    const s = await specScene(b);
    const designer = batchApi(b.app, s.world.actors.designer);
    const ok = await designer.submit(
      s.projectId,
      batch([flow("Parcours design")], { branch: BRANCH }),
    );
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.status).toBe("committed");
    const head = await headOf(b, s);
    for (const operation of [rule("Interdite"), role("Interdit")]) {
      const res = await designer.submit(s.projectId, batch([operation], { branch: BRANCH }));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
    expect(await headOf(b, s)).toBe(head);
  });

  it.each(["client", "business"] as const)(
    "%s est refusé (403) sur specBatch.submit, aucun lot ni audit",
    async (actor) => {
      const b = bench();
      const s = await specScene(b);
      for (const operation of [rule("R"), role("R"), flow("R")]) {
        const res = await batchApi(b.app, s.world.actors[actor]).submit(
          s.projectId,
          batch([operation], { branch: BRANCH }),
        );
        expect(res.status, JSON.stringify(operation)).toBe(403);
      }
      expect(await batchRows(b.database, s.projectId)).toEqual([]);
    },
  );

  it.each(["client", "business"] as const)(
    "%s est refusé (403) sur ai.proposeDeliverable, proposal.list et spec.item.get",
    async (actor) => {
      const b = bench();
      const s = await specScene(b);
      const cookie = s.world.actors[actor].cookie;
      const base = `/projects/${s.projectId}`;
      const calls = [
        send(b.app, cookie, "post", `${base}/ai/deliverable/propose`, {
          projectId: s.projectId,
          deliverable: "functional",
          mode: "complete",
        }),
        send(b.app, cookie, "get", `${base}/proposals?deliverable=functional`),
        send(b.app, cookie, "get", `${base}/spec/items/rule/R-001`),
      ];
      for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
    },
  );
});
