import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { entity, readScene, type SpecReadScene, seedIndex } from "./helpers/spec-read.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-107 lot A (B384) : `spec.data.mermaid` rend le texte de `data/model.mmd` au commit de tête ; absent, il est généré à
 * la volée depuis les tables indexées. Aucun index : 404 ; index en échec : SPEC_INDEX_FAILED.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });

const CLIENT = {
  id: "T-client",
  titre: "Client",
  nom: "Client",
  zone: "Clients",
  champs: [
    { nom: "id", type: "uuid", cle: "primaire" },
    { nom: "nom", type: "texte(80)" },
  ],
};
const RESERVATION = {
  id: "T-reservation",
  titre: "Réservation",
  nom: "Réservation",
  champs: [
    { nom: "id", type: "uuid", cle: "primaire" },
    { nom: "client_id", type: "ref(T-client)" },
  ],
  relations: [{ vers: "T-client", cardinalite: "n → 1" }],
};
const TABLES = [
  entity("table", "T-client", "c", CLIENT),
  entity("table", "T-reservation", "r", RESERVATION),
];

const mermaid = (s: SpecReadScene, actor = s.world.actors.dev, query = "") =>
  send(bench().app, actor.cookie, "get", `/projects/${s.projectId}/spec/data/mermaid${query}`);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.data.mermaid", () => {
  it("data/model.mmd du commit ignoré : texte régénéré depuis les tables indexées (B476)", async () => {
    const s = await readScene(bench());
    const { snapshotId } = await seedIndex(bench(), s, [], { commit: true, entities: TABLES });
    const text = "%% Généré\nerDiagram\n  T_client {\n  }\n";
    const auth = await bench().harness.authFor(s.owner);
    const commit = await bench().harness.inner.writeCommit({
      auth,
      repo: s.ref,
      branch: "cadrage",
      author: { name: "Koklo", email: "koklo-bot@users.noreply.invalid" },
      message: "test: modèle",
      files: [{ path: "data/model.mmd", content: text }],
    });
    await bench().database.query("UPDATE spec_snapshots SET commit_sha = $2 WHERE id = $1", [
      snapshotId,
      commit.sha,
    ]);

    const res = await mermaid(s);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.generated).toBe(true);
    expect(res.body.commitSha).toBe(commit.sha);
    expect(res.body.text).not.toBe(text);
    expect(res.body.text).toContain('T_reservation }o--|| T_client : "n → 1"');
  });

  it("absent du commit : généré à la volée depuis les tables indexées (generated: true)", async () => {
    const s = await readScene(bench());
    const { sha } = await seedIndex(bench(), s, [], { commit: true, entities: TABLES });

    const res = await mermaid(s);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.generated).toBe(true);
    expect(res.body.commitSha).toBe(sha);
    expect(res.body.text).toContain("erDiagram");
    expect(res.body.text).toContain("T_client {");
    expect(res.body.text).toContain('T_reservation }o--|| T_client : "n → 1"');
  });

  it("aucune table : diagramme vide valide ; un contenu de table invalide est ignoré", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [], {
      commit: true,
      entities: [entity("table", "T-casse", "x", { id: "T-casse", champs: 3 })],
    });
    const res = await mermaid(s);
    expect(res.status).toBe(200);
    expect(res.body.text).toContain("erDiagram");
    expect(res.body.text).not.toContain("T_casse");
  });

  it("révision non indexée : 404 ; index en échec : SPEC_INDEX_FAILED", async () => {
    const s = await readScene(bench());
    expect((await mermaid(s)).status).toBe(404);
    await seedIndex(bench(), s, [], { status: "failed", errorCode: "parse_error" });
    const res = await mermaid(s);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SPEC_INDEX_FAILED");
  });

  it("client et business : 403, jamais de lecture", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [], { commit: true, entities: TABLES });
    for (const role of ["client", "business"] as const) {
      expect((await mermaid(s, s.world.actors[role])).status, role).toBe(403);
    }
  });
});
