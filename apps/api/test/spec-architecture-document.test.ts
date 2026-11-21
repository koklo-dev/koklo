import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { BOT } from "./helpers/spec-batch.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-111 lot B (cas 8, B508) : `spec.architecture.document` lit les sections `architecture/overview/NN-<slug>.md` dans git au
 * commit indexé (jamais d'index en base), dans l'ordre de leur numéro, avec leur statut ; la section du scaffold est
 * « brouillon », une section sans corps « à rédiger ».
 */
const read = installBench({ beforeAll, afterAll, beforeEach });

async function sceneWith(sections: Record<string, string>) {
  const s = await readScene(read());
  const auth = await read().harness.authFor(s.owner);
  await read().harness.inner.writeCommit({
    auth,
    repo: s.ref,
    branch: "cadrage",
    author: BOT,
    message: "test: sections du document",
    files: Object.entries(sections).map(([name, content]) => ({
      path: `architecture/overview/${name}`,
      content,
    })),
  });
  const seeded = await seedIndex(read(), s, [], { commit: true, entities: [] });
  return { s, sha: seeded.sha };
}

const document = (
  s: Awaited<ReturnType<typeof readScene>>,
  role: "dev" | "designer" = "dev",
  query = "",
) =>
  send(
    read().app,
    s.world.actors[role].cookie,
    "get",
    `/projects/${s.projectId}/spec/architecture/document${query}`,
  );

describe("spec.architecture.document", () => {
  it("sections dans l'ordre NN, statut du front matter, À rédiger si le corps est vide, hors format ignoré", async () => {
    const { s, sha } = await sceneWith({
      "03-flux.md": "---\nstatut: validee\n---\n# Flux\n\nTexte validé.\n",
      "02-principes.md": "---\nstatut: a_relire\n---\n# Principes\n\n- un module, une zone\n",
      "04-vide.md": "# Sauvegarde\n",
      "notes.md": "# Hors format\n\nx\n",
    });
    const res = await document(s);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.commitSha).toBe(sha);
    expect(
      res.body.sections.map((x: { num: number; specId: string; status: string; title: string }) => [
        x.num,
        x.specId,
        x.status,
        x.title,
      ]),
    ).toEqual([
      [1, "DOC-contexte", "brouillon", "Architecture : contexte"],
      [2, "DOC-principes", "a_relire", "Principes"],
      [3, "DOC-flux", "validee", "Flux"],
      [4, "DOC-vide", "a_rediger", "Sauvegarde"],
    ]);
    expect(res.body.sections[1]).toMatchObject({
      slug: "principes",
      path: "architecture/overview/02-principes.md",
      markdown: "- un module, une zone",
      updatedAt: null,
      lastAuthor: null,
    });
  });

  it("dépôt neuf : la seule section est celle du scaffold, chemin relatif à la spec", async () => {
    const s = await readScene(read());
    await seedIndex(read(), s, [], { commit: true, entities: [] });
    const res = await document(s);
    expect(res.status).toBe(200);
    expect(res.body.sections.map((x: { path: string }) => x.path)).toEqual([
      "architecture/overview/01-contexte.md",
    ]);
  });

  it("rien d'indexé : 404 ; révision double : 400 ; le designer lit aussi", async () => {
    const s = await readScene(read());
    expect((await document(s)).status).toBe(404);
    await seedIndex(read(), s, [], { commit: true, entities: [] });
    expect((await document(s, "designer")).status).toBe(200);
    expect((await document(s, "dev", `?branch=a&commitSha=${"a".repeat(40)}`)).status).toBe(400);
  });
});
