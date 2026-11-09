import { randomUUID } from "node:crypto";
import { GitProviderUnavailableError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BOT, type Scene, WorkerBench } from "./support/spec-write-bench.ts";

/**
 * TK-89 lot B (T15) : un lot de publication de l'espace Idée (pg-boss réel, Postgres éphémère, faux
 * fournisseur) pose UN commit du bot avec les fichiers `idea/` et un `Co-authored-by` par
 * contributeur, e-mails relus en base (jamais dans le payload).
 */
let bench: WorkerBench;

beforeAll(async () => {
  bench = await WorkerBench.create();
  await bench.start();
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(() => {
  bench.spy.reset();
});

async function addUser(name: string, email: string): Promise<string> {
  const id = randomUUID();
  await bench.query(
    "INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $2, $3, true, now(), now())",
    [id, name, email],
  );
  return id;
}

const page = (slug: string, title: string, contentMd: string) => ({
  kind: "idea.page.write",
  payload: {
    slug,
    title,
    status: "draft",
    required: slug === "vision",
    origin: "template",
    mis_a_jour: "2026-11-08T10:00:00.000Z",
    contributeurs: ["Awa"],
    contentMd,
  },
});
const index = (contributorUserIds: string[]) => ({
  kind: "idea.index.write",
  payload: {
    pages: [
      {
        slug: "vision",
        title: "Vision",
        position: 0,
        required: true,
        origin: "template",
        status: "draft",
      },
      {
        slug: "perimetre",
        title: "Périmètre",
        position: 1,
        required: false,
        origin: "template",
        status: "draft",
      },
    ],
    contributorUserIds,
    pagesVersions: { vision: 2, perimetre: 1 },
  },
});

async function publish(
  scene: Scene,
  operations: { kind: string; payload: Record<string, unknown> }[],
) {
  const id = await bench.insertBatch(scene, { operations });
  await bench.enqueue(scene, id);
  return { id, row: await bench.settled(id) };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même publication, un test par comportement
describe("lot de publication idea.*", () => {
  it("un seul commit : fichiers idea/, index, et un Co-authored-by par contributeur sans doublon", async () => {
    const scene = await bench.scene();
    const bea = await addUser("Béa", `bea-${randomUUID().slice(0, 8)}@example.test`);
    const cyril = await addUser(
      "Cyril\nKoklo-Ops: forgé",
      `cyril-${randomUUID().slice(0, 8)}@example.test`,
    );

    const { id, row } = await publish(scene, [
      page("vision", "Vision", "## Vision\n\nTexte.\n"),
      page("perimetre", "Périmètre", ""),
      index([scene.userId, bea, cyril, bea]),
    ]);

    expect(row.status).toBe("committed");
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(1);
    expect(await bench.files(scene)).toEqual(
      expect.arrayContaining(["idea/vision.md", "idea/perimetre.md", "idea/_index.yaml"]),
    );
    const message = (await bench.commits(scene))[0]?.message ?? "";
    expect(message.split("\n")[0]).toBe("idea: publié 2 pages");
    const trailers = message
      .trimEnd()
      .split("\n")
      .filter((line) => /^(Co-authored-by|Koklo-Ops):/.test(line));
    expect(trailers).toHaveLength(4);
    expect(trailers[0]).toBe(`Koklo-Ops: ${id}`);
    expect(trailers[1]).toBe(`Co-authored-by: ${scene.userName} <${scene.userEmail}>`);
    expect(trailers.filter((line) => line.includes("Béa"))).toHaveLength(1);
    expect(trailers.filter((line) => line.startsWith("Koklo-Ops"))).toHaveLength(1);
  });

  it("un identifiant de contributeur inconnu est ignoré, le lot reste valide", async () => {
    const scene = await bench.scene();
    const { row } = await publish(scene, [
      page("vision", "Vision", "Texte"),
      index([randomUUID()]),
    ]);
    expect(row.status).toBe("committed");
  });

  it("une page retirée disparaît du dépôt à la publication suivante", async () => {
    const scene = await bench.scene();
    await publish(scene, [
      page("vision", "Vision", "a"),
      page("ancienne", "Ancienne", "b"),
      index([]),
    ]);
    expect(await bench.files(scene)).toContain("idea/ancienne.md");

    const second = await bench.insertBatch(scene, {
      operations: [
        page("vision", "Vision", "a"),
        { kind: "idea.page.delete", payload: { slug: "ancienne" } },
        index([]),
      ],
    });
    await bench.enqueue(scene, second);
    expect((await bench.settled(second)).status).toBe("committed");
    expect(await bench.files(scene)).not.toContain("idea/ancienne.md");
  });

  it("un slug douteux échoue en INTERNAL sans aucun appel au fournisseur", async () => {
    const scene = await bench.scene();
    const { row } = await publish(scene, [page("../evil", "X", "x"), index([])]);
    expect(row.status).toBe("failed");
    expect(row.error_code).toBe("INTERNAL");
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(0);
  });
});

const synthesis = (source: string) => ({
  kind: "idea.synthesis.write",
  payload: {
    contentMd: "## Résumé\n\nUn outil de cadrage.\n",
    source,
    generatedAt: "2026-11-09T10:00:00.000Z",
  },
});
const tag = (name: string) => ({ kind: "idea.version.tag", payload: { name } });
const freezeLot = (name: string) => [
  page("vision", "Vision", "## Vision\n\nTexte.\n"),
  page("perimetre", "Périmètre", ""),
  index([]),
  synthesis(name),
  tag(name),
];

/** Commit pointé par un tag, ou `undefined` si le tag n'existe pas. */
async function tagTarget(scene: Scene, name: string): Promise<string | undefined> {
  try {
    return (await bench.commits(scene, name, 1))[0]?.sha;
  } catch {
    return undefined;
  }
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même lot, un test par comportement
describe("lot de passage au cadrage : tag idea-vN et Synthèse (TK-91)", () => {
  it("commit unique avec idea/_synthese.md (genere: true), puis tag idea-v1 sur CE commit", async () => {
    const scene = await bench.scene();
    const { row } = await publish(scene, freezeLot("idea-v1"));

    expect(row.status).toBe("committed");
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(1);
    expect(await bench.files(scene)).toContain("idea/_synthese.md");
    const text = (await bench.read(scene, "idea/_synthese.md")).content;
    expect(text).toContain("genere: true");
    expect(text).toContain("source: idea-v1");
    expect(row.commit_sha).toBe((await bench.commits(scene))[0]?.sha);
    expect(await tagTarget(scene, "idea-v1")).toBe(row.commit_sha);
    // Le tag est posé APRÈS le commit.
    const order = bench.spy.calls.map((call) => call.method);
    expect(order.indexOf("createTag")).toBeGreaterThan(order.indexOf("writeCommit"));
    expect(bench.spy.callsOf("createTag")).toHaveLength(1);
  });

  it("la version suivante pose idea-v2 sur le nouveau commit ; idea-v1 reste où il était", async () => {
    const scene = await bench.scene();
    const first = await publish(scene, freezeLot("idea-v1"));
    const second = await publish(scene, [
      page("vision", "Vision", "## Vision\n\nTexte revu.\n"),
      index([]),
      synthesis("idea-v2"),
      tag("idea-v2"),
    ]);
    expect(second.row.status).toBe("committed");
    expect(await tagTarget(scene, "idea-v1")).toBe(first.row.commit_sha);
    expect(await tagTarget(scene, "idea-v2")).toBe(second.row.commit_sha);
    expect(second.row.commit_sha).not.toBe(first.row.commit_sha);
  });

  it("une publication ordinaire ne pose aucun tag", async () => {
    const scene = await bench.scene();
    const { row } = await publish(scene, [page("vision", "Vision", "a"), index([])]);
    expect(row.status).toBe("committed");
    expect(bench.spy.callsOf("createTag")).toHaveLength(0);
  });

  it("un nom de tag douteux échoue en INTERNAL sans aucun appel au fournisseur", async () => {
    const scene = await bench.scene();
    const { row } = await publish(scene, [
      page("vision", "Vision", "a"),
      index([]),
      tag("idea-v0"),
    ]);
    expect(row.status).toBe("failed");
    expect(row.error_code).toBe("INTERNAL");
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(0);
    expect(bench.spy.callsOf("createTag")).toHaveLength(0);
  });

  it("reprise après crash entre le commit et le tag : le commit retrouvé est tagué, sans second commit", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, {
      status: "committing",
      operations: freezeLot("idea-v1"),
    });
    const auth = await bench.spy.auth(scene.owner);
    const posted = await bench.spy.inner.writeCommit({
      auth,
      repo: scene.ref,
      branch: "cadrage",
      author: BOT,
      message: `idea: publié 2 pages\n\nKoklo-Ops: ${id}\n`,
      files: [{ path: "idea/vision.md", content: "posé avant le crash\n" }],
    });
    expect(await tagTarget(scene, "idea-v1")).toBeUndefined();
    bench.spy.reset();

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    expect(row.status).toBe("committed");
    expect(row.commit_sha).toBe(posted.sha);
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(0);
    expect(await tagTarget(scene, "idea-v1")).toBe(posted.sha);
  });

  it("un tag déjà posé sur le même commit est un succès (rejeu après le tag)", async () => {
    const scene = await bench.scene();
    const id = await bench.insertBatch(scene, {
      status: "committing",
      operations: freezeLot("idea-v1"),
    });
    const auth = await bench.spy.auth(scene.owner);
    const posted = await bench.spy.inner.writeCommit({
      auth,
      repo: scene.ref,
      branch: "cadrage",
      author: BOT,
      message: `idea: publié 2 pages\n\nKoklo-Ops: ${id}\n`,
      files: [{ path: "idea/vision.md", content: "posé avant le crash\n" }],
    });
    await bench.spy.inner.createTag({ auth, repo: scene.ref, ref: posted.sha, name: "idea-v1" });
    bench.spy.reset();

    await bench.enqueue(scene, id);
    const row = await bench.settled(id);

    expect(row.status).toBe("committed");
    expect(row.commit_sha).toBe(posted.sha);
  });

  it("un tag déjà posé sur un AUTRE commit : le lot est en conflit (write_conflict), jamais déplacé", async () => {
    const scene = await bench.scene();
    const auth = await bench.spy.auth(scene.owner);
    const head = (await bench.commits(scene))[0]?.sha ?? "";
    await bench.spy.inner.createTag({ auth, repo: scene.ref, ref: head, name: "idea-v1" });

    const { row } = await publish(scene, freezeLot("idea-v1"));

    expect(row.status).toBe("conflict");
    expect(row.error_code).toBe("write_conflict");
    expect(await tagTarget(scene, "idea-v1")).toBe(head);
  });

  it("panne passagère à la pose du tag : le lot est rejoué, un seul commit, le tag finit posé", async () => {
    const scene = await bench.scene();
    bench.spy.failWith("createTag", new GitProviderUnavailableError({ operation: "createTag" }), 1);

    const { row } = await publish(scene, freezeLot("idea-v1"));

    expect(row.status).toBe("committed");
    expect(bench.spy.callsOf("writeCommit")).toHaveLength(1);
    expect(bench.spy.callsOf("createTag").length).toBeGreaterThanOrEqual(2);
    expect(await tagTarget(scene, "idea-v1")).toBe(row.commit_sha);
  });
});
