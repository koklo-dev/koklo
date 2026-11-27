import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { commitAtHead } from "./helpers/spec-architecture.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";
import { technicalApi } from "./helpers/spec-technical.ts";

/**
 * TK-115 lot B (B723) : onglet Document. `spec.document.sections` lit en Git, au commit indexé, les sections du livrable
 * demandé (`tech/cahier-technique/` ou `architecture/overview/`), dans l'ordre de leur numéro.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
const section = (title: string, status: string, body: string) =>
  `---\nstatut: ${status}\n---\n# ${title}\n${body === "" ? "" : `\n${body}\n`}`;

describe("spec.document.sections", () => {
  it("technique : les sections du cahier seulement, ordonnées, statut et vide « à rédiger »", async () => {
    const s = await readScene(bench());
    const { snapshotId } = await seedIndex(bench(), s, [], { commit: true, entities: [] });
    const sha = await commitAtHead(bench(), s, snapshotId, [
      { path: "tech/cahier-technique/02-tests.md", content: section("Tests", "brouillon", "") },
      { path: "tech/cahier-technique/01-objet.md", content: section("Objet", "validee", "But.") },
      {
        path: "architecture/overview/01-contexte.md",
        content: section("Contexte", "validee", "x"),
      },
    ]);
    const api = technicalApi(bench().app, s.world.actors.designer);
    const res = await api.sections(s.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.commitSha).toBe(sha);
    expect(
      res.body.sections.map((entry: { specId: string; num: number; status: string }) => [
        entry.specId,
        entry.num,
        entry.status,
      ]),
    ).toEqual([
      ["DOC-objet", 1, "validee"],
      ["DOC-tests", 2, "a_rediger"],
    ]);
    expect(res.body.sections[0]).toMatchObject({
      title: "Objet",
      markdown: "But.",
      path: "tech/cahier-technique/01-objet.md",
    });
    const architecture = await api.sections(s.projectId, "architecture");
    expect(architecture.body.sections.map((e: { specId: string }) => e.specId)).toEqual([
      "DOC-contexte",
    ]);
  });

  it("rien d'indexé : 404 ; livrable sans document : refusé", async () => {
    const s = await readScene(bench());
    const api = technicalApi(bench().app, s.world.actors.dev);
    expect((await api.sections(s.projectId)).status).toBe(404);
    expect((await api.sections(s.projectId, "security")).status).toBe(400);
  });
});
