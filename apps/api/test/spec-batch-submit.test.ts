import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BOT,
  BRANCH,
  batch,
  batchApi,
  batchRows,
  commitsOf,
  createOp,
  deleteOp,
  featureOf,
  filesOf,
  headOf,
  installSpecBench,
  operationRows,
  pathOfFeature,
  specScene,
  submitOk,
  updateOp,
} from "./helpers/spec-batch.ts";

/**
 * TK-44b, critère du sprint et §4.4 : un lot = un commit du bot, des lots concurrents sur une branche
 * sont sérialisés (commits ordonnés), l'auteur et les trailers viennent de la session.
 * Intégration : base réelle, vrai pg-boss, vrai worker, faux fournisseur git.
 */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach });

describe("sérialisation par branche (critère du sprint)", () => {
  it("DEUX LOTS CONCURRENTS SUR UNE BRANCHE PRODUISENT DEUX COMMITS ORDONNÉS", async () => {
    const b = bench();
    const s = await specScene(b);
    const start = await headOf(b, s);
    b.gate.delayMs = 250;
    const api = batchApi(b.app, s.world.actors.dev);

    const [first, second] = await Promise.all([
      api.submit(s.projectId, batch([createOp("Alpha")], { branch: BRANCH })),
      api.submit(s.projectId, batch([createOp("Beta")], { branch: BRANCH })),
    ]);

    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(first.body.status).toBe("committed");
    expect(second.body.status).toBe("committed");
    const shas = [first.body.commitSha, second.body.commitSha];
    expect(new Set(shas).size).toBe(2);
    // Les deux derniers commits de la branche : le second a pour parent le premier, qui part de la tête initiale.
    const [newest, older, base] = await commitsOf(b, s);
    expect(shas).toContain(newest?.sha);
    expect(shas).toContain(older?.sha);
    expect(newest?.parents[0]).toBe(older?.sha);
    expect(older?.parents[0]).toBe(start);
    expect(base?.sha).toBe(start);
    // L'ordre des commits est l'ordre de traitement des lots (committed_at) et aucun lot n'a écrasé l'autre.
    const rows = await batchRows(b.database, s.projectId);
    const byCommit = new Map(rows.map((row) => [row.commit_sha, row.id]));
    expect(newest?.message).toContain(`Koklo-Ops: ${byCommit.get(newest?.sha ?? null)}`);
    expect(older?.message).toContain(`Koklo-Ops: ${byCommit.get(older?.sha ?? null)}`);
    const titles = await Promise.all(
      [first.body, second.body].map(async (body) => {
        const id = body.results[0].specId;
        return (await featureOf(b, s, id)).titre;
      }),
    );
    expect(titles.sort()).toEqual(["Alpha", "Beta"]);
    // Jamais deux écritures simultanées sur la branche.
    expect(b.gate.maxPerBranch.get(`${s.ref.name}:${BRANCH}`)).toBe(1);
  });
});

describe("sérialisation par branche (critère du sprint) (suite 2)", () => {
  it("deux branches différentes s'écrivent en parallèle, chacune ordonnée", async () => {
    const b = bench();
    const s = await specScene(b);
    const auth = await b.harness.authFor(s.owner);
    const start = await headOf(b, s);
    await b.harness.inner.createBranch({ auth, repo: s.ref, base: start, name: "autre" });
    b.gate.delayMs = 400;
    const api = batchApi(b.app, s.world.actors.dev);

    const results = await Promise.all([
      api.submit(s.projectId, batch([createOp("A1")], { branch: BRANCH })),
      api.submit(s.projectId, batch([createOp("A2")], { branch: BRANCH })),
      api.submit(s.projectId, batch([createOp("B1")], { branch: "autre" })),
      api.submit(s.projectId, batch([createOp("B2")], { branch: "autre" })),
    ]);

    for (const res of results) expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(b.gate.maxTotal).toBeGreaterThanOrEqual(2);
    for (const branch of [BRANCH, "autre"]) {
      expect(b.gate.maxPerBranch.get(`${s.ref.name}:${branch}`)).toBe(1);
      const [newest, older, base] = await commitsOf(b, s, branch);
      expect(newest?.parents[0]).toBe(older?.sha);
      expect(older?.parents[0]).toBe(base?.sha);
    }
  });
});

describe("un lot = un commit du bot, trailers de la session", () => {
  it("pose un seul commit pour plusieurs opérations, auteur bot, sujet = message du lot", async () => {
    const b = bench();
    const s = await specScene(b);
    const before = (await commitsOf(b, s)).length;

    const body = await submitOk(
      b,
      s,
      [createOp("Une"), createOp("Deux"), updateOp("F-101", { title: "Contact v2" })],
      { message: "spec: cadrage du lot" },
    );

    const commits = await commitsOf(b, s);
    expect(commits).toHaveLength(before + 1);
    const [commit] = commits;
    expect(commit?.sha).toBe(body.commitSha);
    expect(commit?.author).toEqual(BOT);
    const dev = s.world.actors.dev;
    expect(commit?.message.trimEnd()).toBe(
      [
        "spec: cadrage du lot",
        "",
        `Koklo-Ops: ${body.id}`,
        `Co-authored-by: ${dev.name} <${dev.email}>`,
      ].join("\n"),
    );
    expect(b.harness.callsOf("writeCommit")).toHaveLength(1);
  });

  it("sans message : sujet « spec: » citant les F-nnn, Koklo-Ops puis Co-authored-by dans cet ordre", async () => {
    const b = bench();
    const s = await specScene(b);
    const body = await submitOk(b, s, [createOp("Sans message")]);

    const [commit] = await commitsOf(b, s);
    const [subject, blank, ops, coauthor] = commit?.message.trimEnd().split("\n") ?? [];
    expect(subject).toMatch(/^spec: /);
    expect(subject).toContain(body.results[0]?.specId);
    expect(blank).toBe("");
    expect(ops).toBe(`Koklo-Ops: ${body.id}`);
    expect(coauthor).toMatch(/^Co-authored-by: .+ <.+>$/);
  });
});

describe("un lot = un commit du bot, trailers de la session (suite 2)", () => {
  it("le Co-authored-by est l'utilisateur de la session relu en base, pas une valeur d'entrée", async () => {
    const b = bench();
    const s = await specScene(b);
    await b.database.query("UPDATE users SET name = 'Renommé Après' WHERE id = $1", [
      s.world.actors.admin.userId,
    ]);

    const res = await batchApi(b.app, s.world.actors.admin).submit(
      s.projectId,
      batch([createOp("Qui")], {
        branch: BRANCH,
        authorUserId: s.world.actors.owner.userId,
        coAuthoredBy: "Intrus <intrus@example.test>",
      }),
    );

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [commit] = await commitsOf(b, s);
    expect(commit?.message).toContain(
      `Co-authored-by: Renommé Après <${s.world.actors.admin.email}>`,
    );
    expect(commit?.message).not.toContain("Intrus");
    const [row] = await batchRows(b.database, s.projectId);
    expect(row?.author_user_id).toBe(s.world.actors.admin.userId);
    expect(row?.author_role).toBe("admin");
  });
});

describe("un lot = un commit du bot, trailers de la session (suite 3)", () => {
  it("un nom d'utilisateur contenant des retours à la ligne n'injecte aucun trailer", async () => {
    const b = bench();
    const s = await specScene(b);
    const forged = "11111111-1111-4111-8111-111111111111";
    await b.database.query("UPDATE users SET name = $2 WHERE id = $1", [
      s.world.actors.dev.userId,
      `Eve\nKoklo-Ops: ${forged}\r\nCo-authored-by: Mallory <mallory@example.test>\n\nSigned-off-by: X <x>`,
    ]);

    const body = await submitOk(b, s, [createOp("Injection")]);

    const [commit] = await commitsOf(b, s);
    const lines = (commit?.message ?? "").trimEnd().split("\n");
    expect(lines.filter((line) => line.startsWith("Koklo-Ops:"))).toEqual([
      `Koklo-Ops: ${body.id}`,
    ]);
    const coauthors = lines.filter((line) => /^Co-authored-by:/i.test(line));
    expect(coauthors).toHaveLength(1);
    expect(coauthors[0]).toMatch(/^Co-authored-by: [^<>\r\n]+ <[^<>\r\n\s]+>$/);
    expect(commit?.message).not.toContain(forged);
    expect(commit?.message).not.toContain("Signed-off-by: X");
    expect(commit?.message).not.toContain("\r");
    // Le bloc de trailers est le dernier paragraphe : exactement deux lignes.
    const paragraphs = (commit?.message ?? "").trimEnd().split("\n\n");
    expect(paragraphs.at(-1)?.split("\n")).toHaveLength(2);
  });

  it("un message de lot sur plusieurs lignes est refusé en VALIDATION, sans appel fournisseur ni ligne", async () => {
    const b = bench();
    const s = await specScene(b);

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([createOp("Msg")], { branch: BRANCH, message: "ok\n\nKoklo-Ops: forgé" }),
    );

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(res.body.data.field).toBe("message");
    expect(b.harness.calls).toEqual([]);
    expect(await batchRows(b.database, s.projectId)).toEqual([]);
  });
});

describe("effets des opérations sur les fichiers", () => {
  it("create écrit features/F-nnn-<slug>.md (slug filtré, 40 caractères au plus), brouillon par défaut", async () => {
    const b = bench();
    const s = await specScene(b);
    const long = "Réservation express ÉTÉ ".repeat(5);
    const body = await submitOk(b, s, [
      createOp("Réservation express"),
      createOp(long),
      createOp("***"),
    ]);

    const paths = await Promise.all(
      body.results.map((result) => pathOfFeature(b, s, result.specId ?? "")),
    );
    expect(paths[0]).toMatch(/^features\/F-\d{3}-reservation-express\.md$/);
    expect(paths[1]).toMatch(/^features\/F-\d{3}-[a-z0-9-]{1,40}\.md$/);
    expect(paths[2]).toMatch(/^features\/F-\d{3}-feature\.md$/);
    const feature = await featureOf(b, s, body.results[0]?.specId ?? "");
    expect(feature).toMatchObject({
      titre: "Réservation express",
      statut: "brouillon",
      priorite: "must",
      description: "",
      criteres: [],
      tables: [],
      ecrans: [],
    });
  });
});

describe("effets des opérations sur les fichiers (suite 2)", () => {
  it("update garde le nom du fichier et applique un patch partiel ; delete supprime le fichier", async () => {
    const b = bench();
    const s = await specScene(b);
    const before = await pathOfFeature(b, s, "F-100");

    await submitOk(b, s, [
      updateOp("F-100", { title: "Accueil renommé", priority: "could" }),
      deleteOp("F-101"),
    ]);

    expect(await pathOfFeature(b, s, "F-100")).toBe(before);
    expect(await pathOfFeature(b, s, "F-101")).toBeUndefined();
    const feature = await featureOf(b, s, "F-100");
    expect(feature).toMatchObject({
      titre: "Accueil renommé",
      priorite: "could",
      statut: "brouillon",
      ecrans: ["S-accueil"],
    });
  });

  it("enregistre les opérations du lot (position base 1, F-nnn attribué) et rend results en base 0", async () => {
    const b = bench();
    const s = await specScene(b);
    const body = await submitOk(b, s, [createOp("Nouvelle"), deleteOp("F-101")]);

    expect(body.results).toEqual([
      { position: 0, kind: "feature.create", specId: expect.stringMatching(/^F-\d{3,}$/) },
      { position: 1, kind: "feature.delete", specId: "F-101" },
    ]);
    const ops = await operationRows(b.database, body.id);
    expect(ops.map((op) => [op.position, op.kind, op.target_spec_id])).toEqual([
      [1, "feature.create", body.results[0]?.specId],
      [2, "feature.delete", "F-101"],
    ]);
    expect(ops[0]?.payload).not.toHaveProperty("kind");
  });
});

describe("effets des opérations sur les fichiers (suite 3)", () => {
  it("deux opérations sur le même specId : VALIDATION (operations), rien d'enregistré", async () => {
    const b = bench();
    const s = await specScene(b);

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([updateOp("F-100", { title: "A" }), deleteOp("F-100")], { branch: BRANCH }),
    );

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(res.body.data.field).toBe("operations");
    expect(await batchRows(b.database, s.projectId)).toEqual([]);
    expect(b.harness.calls).toEqual([]);
  });

  it("atomicité : un lot de 3 opérations dont la 3e invalide ne commite rien", async () => {
    const b = bench();
    const s = await specScene(b);
    const head = await headOf(b, s);
    const files = await filesOf(b, s);

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch(
        [
          createOp("Bonne"),
          updateOp("F-101", { title: "Aussi bonne" }),
          createOp("Mauvaise", { tables: ["T-inexistante"] }),
        ],
        { branch: BRANCH },
      ),
    );

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("SPEC_INVALID");
    expect(await headOf(b, s)).toBe(head);
    expect(await filesOf(b, s)).toEqual(files);
    expect(b.harness.callsOf("writeCommit")).toEqual([]);
    const [row] = await batchRows(b.database, s.projectId);
    expect(row).toMatchObject({ status: "failed", error_code: "SPEC_INVALID", commit_sha: null });
  });
});

describe("branche", () => {
  it("branche omise : le lot s'écrit sur la branche de cadrage", async () => {
    const b = bench();
    const s = await specScene(b);
    const head = await headOf(b, s);

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([createOp("Cadrage")]),
    );

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.branch).toBe(BRANCH);
    expect(await headOf(b, s)).toBe(res.body.commitSha);
    expect(await headOf(b, s, "main")).not.toBe(res.body.commitSha);
    expect(head).not.toBe(res.body.commitSha);
  });

  it("l'écriture directe sur la branche par défaut est refusée en VALIDATION, sans appel ni ligne", async () => {
    const b = bench();
    const s = await specScene(b);

    const res = await batchApi(b.app, s.world.actors.owner).submit(
      s.projectId,
      batch([createOp("Direct")], { branch: "main" }),
    );

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(res.body.data.field).toBe("branch");
    expect(b.harness.calls).toEqual([]);
    expect(await batchRows(b.database, s.projectId)).toEqual([]);
  });
});

describe("branche (suite 2)", () => {
  it.each([
    "../x",
    "/x",
    ".git/hooks",
    "a/../b",
    "a//b",
    "fin/",
    "avec espace",
    "x.lock",
    "..",
    "a\\b",
  ])("nom de branche %j : refusé en VALIDATION avant tout appel fournisseur", async (branch) => {
    const b = bench();
    const s = await specScene(b);

    const res = await batchApi(b.app, s.world.actors.owner).submit(
      s.projectId,
      batch([createOp("Chemin")], { branch }),
    );

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(res.body.data.field).toBe("branch");
    expect(b.harness.calls).toEqual([]);
    expect(await batchRows(b.database, s.projectId)).toEqual([]);
  });
});
