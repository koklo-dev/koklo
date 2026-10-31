import { emitFeatureMarkdown } from "@koklo/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BRANCH,
  batch,
  batchApi,
  batchRows,
  commitDirect,
  commitsOf,
  createOp,
  criterion,
  deleteOp,
  featureOf,
  headOf,
  installSpecBench,
  pathOfFeature,
  specScene,
  submitOk,
  updateOp,
} from "./helpers/spec-batch.ts";

/** TK-44b §4.2 : tête périmée, validation @koklo/schema (erreurs nouvelles seulement), règle des AC-n. */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach });

const rawFeature = (id: string, tables: string[]) =>
  emitFeatureMarkdown({
    id,
    titre: `Feature ${id}`,
    statut: "brouillon",
    priorite: "could",
    tables,
    endpoints: [],
    ecrans: [],
    roles: [],
    regles: [],
    nfr: [],
    description: "",
    criteres: [],
  });

describe("baseSha", () => {
  it("égal à la tête : le lot est commité", async () => {
    const b = bench();
    const s = await specScene(b);
    const baseSha = await headOf(b, s);

    const body = await submitOk(b, s, [createOp("À jour")], { baseSha });

    expect(body.status).toBe("committed");
    expect(await headOf(b, s)).toBe(body.commitSha);
  });

  it("périmé : SPEC_BATCH_CONFLICT stale_base avec le batchId, lot conflict, aucun commit", async () => {
    const b = bench();
    const s = await specScene(b);
    const stale = await headOf(b, s);
    await submitOk(b, s, [createOp("Fait avancer")]);
    const head = await headOf(b, s);
    const commits = (await commitsOf(b, s)).length;

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([createOp("Périmé")], { branch: BRANCH, baseSha: stale }),
    );

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SPEC_BATCH_CONFLICT");
    expect(res.body.data.reason).toBe("stale_base");
    const rows = await batchRows(b.database, s.projectId);
    const row = rows.find((candidate) => candidate.base_sha === stale);
    expect(res.body.data.batchId).toBe(row?.id);
    expect(row).toMatchObject({ status: "conflict", error_code: "stale_base", commit_sha: null });
    expect(await headOf(b, s)).toBe(head);
    expect((await commitsOf(b, s)).length).toBe(commits);
    const got = await batchApi(b.app, s.world.actors.dev).get(s.projectId, row?.id ?? "");
    expect(got.body).toMatchObject({
      status: "conflict",
      errorCode: "stale_base",
      commitSha: null,
    });
  });
});

describe("écriture concurrente avec l'état réel de la branche", () => {
  it("update d'un F-nnn absent de la tête : write_conflict, vérifié par listFiles, aucune écriture", async () => {
    const b = bench();
    const s = await specScene(b);
    const head = await headOf(b, s);

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([updateOp("F-999", { title: "Fantôme" })], { branch: BRANCH }),
    );

    expect(res.status).toBe(409);
    expect(res.body.data.reason).toBe("write_conflict");
    expect(b.harness.callsOf("listFiles").length).toBeGreaterThan(0);
    expect(b.harness.callsOf("writeCommit")).toEqual([]);
    expect(await headOf(b, s)).toBe(head);
  });

  it("delete d'un chemin absent ou d'un dossier : write_conflict, jamais de suppression envoyée", async () => {
    const b = bench();
    const s = await specScene(b);
    // `features/F-200-dossier/` est un dossier : aucun fichier `features/F-200-*.md`.
    await commitDirect(b, s, [{ path: "features/F-200-dossier/note.md", content: "# note\n" }]);

    for (const specId of ["F-999", "F-200"]) {
      const res = await batchApi(b.app, s.world.actors.dev).submit(
        s.projectId,
        batch([deleteOp(specId)], { branch: BRANCH }),
      );
      expect(res.status, specId).toBe(409);
      expect(res.body.data.reason, specId).toBe("write_conflict");
    }
    expect(b.harness.callsOf("listFiles").length).toBeGreaterThan(0);
    expect(b.harness.callsOf("writeCommit")).toEqual([]);
  });
});

describe("écriture concurrente avec l'état réel de la branche (suite 2)", () => {
  it("create dont le F-nnn existe déjà sur la tête (compteur en retard) : write_conflict", async () => {
    const b = bench();
    const s = await specScene(b);
    await commitDirect(b, s, [
      { path: "features/F-001-existante.md", content: rawFeature("F-001", []) },
    ]);
    const head = await headOf(b, s);

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([createOp("Collision")], { branch: BRANCH }),
    );

    expect(res.status).toBe(409);
    expect(res.body.data.reason).toBe("write_conflict");
    expect(await headOf(b, s)).toBe(head);
    expect(b.harness.callsOf("writeCommit")).toEqual([]);
  });
});

describe("SPEC_INVALID : seules les erreurs nouvelles bloquent", () => {
  it("une référence pendante renvoie le rapport (R4_UNKNOWN_TABLE) et ne commite rien", async () => {
    const b = bench();
    const s = await specScene(b);
    const head = await headOf(b, s);

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([createOp("Pendante", { tables: ["T-fantome"] })], { branch: BRANCH }),
    );

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("SPEC_INVALID");
    const { report } = res.body.data;
    expect(report.ok).toBe(false);
    expect(report.counts.error).toBeGreaterThanOrEqual(1);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "R4_UNKNOWN_TABLE", severity: "error", rule: 4 }),
      ]),
    );
    expect(await headOf(b, s)).toBe(head);
    const [row] = await batchRows(b.database, s.projectId);
    expect(row?.report?.issues.map((issue) => issue.code)).toContain("R4_UNKNOWN_TABLE");
  });
});

describe("SPEC_INVALID : seules les erreurs nouvelles bloquent (suite 2)", () => {
  it("une erreur préexistante ne bloque pas un lot propre et n'apparaît pas dans le rapport d'un lot fautif", async () => {
    const b = bench();
    const s = await specScene(b);
    await commitDirect(b, s, [
      { path: "features/F-102-cassee.md", content: rawFeature("F-102", ["T-ancienne-erreur"]) },
    ]);

    const clean = await submitOk(b, s, [createOp("Propre")]);
    expect(clean.status).toBe("committed");

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([createOp("Nouvelle faute", { tables: ["T-nouvelle-erreur"] })], { branch: BRANCH }),
    );
    expect(res.status).toBe(422);
    const errors = res.body.data.report.issues.filter(
      (issue: { severity: string }) => issue.severity === "error",
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.map((issue: { entityId?: string }) => issue.entityId)).not.toContain("F-102");
    expect(JSON.stringify(res.body.data.report)).not.toContain("T-ancienne-erreur");
  });

  it("le rapport est plafonné à 100 diagnostics avec truncated", async () => {
    const b = bench();
    const s = await specScene(b);
    const tables = Array.from({ length: 120 }, (_, i) => `T-fantome-${i}`);

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([createOp("Beaucoup", { tables })], { branch: BRANCH }),
    );

    expect(res.status).toBe(422);
    const { report } = res.body.data;
    expect(report.issues).toHaveLength(100);
    expect(report.truncated).toBe(true);
    expect(report.counts.error).toBeGreaterThanOrEqual(120);
  });
});

describe("SPEC_INVALID : seules les erreurs nouvelles bloquent (suite 3)", () => {
  it("un AC-n encore cité par un scénario de test, supprimé par un criteria remplacé : refusé", async () => {
    const b = bench();
    const s = await specScene(b);
    await submitOk(b, s, [updateOp("F-101", { criteria: [criterion("Premier")] })]);
    await commitDirect(b, s, [
      {
        path: "tests/scenarios/F-101-contact.yaml",
        content: "feature: F-101\ntype: e2e\nfichier: e2e/contact.spec.ts\ncriteres: [AC-1]\n",
      },
    ]);
    const head = await headOf(b, s);

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([updateOp("F-101", { criteria: [criterion("Autre titre")] })], { branch: BRANCH }),
    );

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("SPEC_INVALID");
    expect(res.body.data.report.issues.map((issue: { code: string }) => issue.code)).toContain(
      "R4_UNKNOWN_CRITERION",
    );
    expect(await headOf(b, s)).toBe(head);
  });
});

describe("renumérotation des critères AC-n (criteria remplacé en bloc)", () => {
  const ids = async (specId: string) =>
    (await featureOf(bench(), await scene(), specId)).criteres.map((c) => `${c.id}:${c.titre}`);
  let current: Awaited<ReturnType<typeof specScene>> | undefined;
  const scene = async () => {
    current ??= await specScene(bench());
    return current;
  };

  it("titre inchangé = même id, ajout = max+1, suppression ne renumérote pas, aucun id réattribué", async () => {
    current = undefined;
    const b = bench();
    const s = await scene();
    const set = (...titles: string[]) =>
      submitOk(b, s, [updateOp("F-101", { criteria: titles.map(criterion) })]);

    await set("Alpha", "Beta", "Gamma");
    expect(await ids("F-101")).toEqual(["AC-1:Alpha", "AC-2:Beta", "AC-3:Gamma"]);

    await set("Gamma", "Alpha", "Delta");
    expect(await ids("F-101")).toEqual(["AC-3:Gamma", "AC-1:Alpha", "AC-4:Delta"]);

    await set("Delta", "Echo");
    expect(await ids("F-101")).toEqual(["AC-4:Delta", "AC-5:Echo"]);

    await set("  Delta ", "alpha");
    expect(await ids("F-101")).toEqual(["AC-4:Delta", "AC-6:alpha"]);
  });

  it("deux critères de même titre : correspondance dans l'ordre, le premier reprend l'id le plus bas", async () => {
    current = undefined;
    const b = bench();
    const s = await scene();
    await submitOk(b, s, [updateOp("F-101", { criteria: [criterion("Un"), criterion("Deux")] })]);

    await submitOk(b, s, [
      updateOp("F-101", { criteria: [criterion("Un"), criterion("Un"), criterion("Deux")] }),
    ]);

    expect(await ids("F-101")).toEqual(["AC-1:Un", "AC-3:Un", "AC-2:Deux"]);
  });

  it("une feature créée numérote ses critères à partir de AC-1", async () => {
    current = undefined;
    const b = bench();
    const s = await scene();
    const body = await submitOk(b, s, [
      createOp("Neuve", { criteria: [criterion("Premier"), criterion("Second")] }),
    ]);

    const specId = body.results[0]?.specId ?? "";
    expect(await pathOfFeature(b, s, specId)).toBeDefined();
    expect(await ids(specId)).toEqual(["AC-1:Premier", "AC-2:Second"]);
  });
});
