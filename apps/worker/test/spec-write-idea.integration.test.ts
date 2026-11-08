import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Scene, WorkerBench } from "./support/spec-write-bench.ts";

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
