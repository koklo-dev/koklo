import { emitTableYaml, parseSpecFiles } from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { integrityProblem } from "./paths.ts";
import { planBatch } from "./plan.ts";
import type { BatchOperation, LoadedBatch } from "./types.ts";

/**
 * TK-108 lot B (B418) : genre `layout` du plan (pur) : `layout.save` écrit `data/_layout.yaml` trié par identifiant, sans
 * toucher `data/model.mmd` ; le designer est refusé ; aucun conflit (le dernier écrit gagne) ; payload invalide : SPEC_INVALID.
 */
const MANIFEST = {
  path: "koklo.project.yaml",
  content: "projet: demo\norganisation: acme\nspec_version: 2\n",
};
const TABLE = {
  path: "data/tables/client.yaml",
  content: emitTableYaml({
    id: "T-client",
    nom: "client",
    zone: "Clients",
    source: [],
    champs: [{ nom: "id", type: "uuid", cle: "primaire" }],
  }),
};
const BASE = [MANIFEST, TABLE];
const POSITIONS = { "T-reservation": { x: 300, y: 40 }, "T-client": { x: 0, y: 8 } };

const op = (payload: Record<string, unknown> = { positions: POSITIONS }): BatchOperation => ({
  position: 1,
  kind: "layout.save",
  targetSpecId: null,
  payload,
});
const plan = (operations: BatchOperation[], files = BASE, authorRole = "dev") =>
  planBatch({ operations, authorRole }, files);
const changes = (result: ReturnType<typeof plan>) => ("changes" in result ? result.changes : []);

describe("layout.save", () => {
  it.each(["owner", "admin", "dev"])("%s : écrit data/_layout.yaml, rien d'autre", (role) => {
    const result = plan([op()], BASE, role);
    expect(changes(result).map((c) => c.path)).toEqual(["data/_layout.yaml"]);
    const [change] = changes(result);
    expect(change && "content" in change ? change.content : "").toBe(
      "positions:\n  T-client:\n    x: 0\n    y: 8\n  T-reservation:\n    x: 300\n    y: 40\n",
    );
  });

  it("data/model.mmd reste intact (aucune réécriture) et la spec reste valide", () => {
    const result = plan([op()], [...BASE, { path: "data/model.mmd", content: "erDiagram\n" }]);
    expect(changes(result).map((c) => c.path)).not.toContain("data/model.mmd");
    const { issues } = parseSpecFiles([...BASE, { path: "data/_layout.yaml", content: "x: 1\n" }]);
    expect(issues).toEqual([]);
  });

  it("remplace un fichier déjà présent : pas de conflit, le dernier écrit gagne", () => {
    const files = [...BASE, { path: "data/_layout.yaml", content: "positions: {}\n" }];
    const result = plan([op({ positions: { "T-client": { x: 5, y: 6 } } })], files);
    expect("outcome" in result).toBe(false);
    const [change] = changes(result);
    expect(change && "content" in change ? change.content : "").toContain("x: 5");
  });

  it("le designer est refusé (FORBIDDEN) sans aucun changement", () => {
    expect(plan([op()], BASE, "designer")).toEqual({
      outcome: expect.objectContaining({ errorCode: "FORBIDDEN" }),
    });
  });

  it("positions invalides (négative, hors bornes) : SPEC_INVALID, aucun changement", () => {
    for (const positions of [{ "T-a": { x: -1, y: 0 } }, { "T-a": { x: 0, y: 20001 } }]) {
      const result = plan([op({ positions })]);
      expect(result).toEqual({ outcome: expect.objectContaining({ errorCode: "SPEC_INVALID" }) });
    }
    expect(plan([op({})])).toEqual({
      outcome: expect.objectContaining({ errorCode: "SPEC_INVALID" }),
    });
  });

  it("intégrité : layout.save est un genre connu, sans identifiant cible ; un identifiant cible est refusé", () => {
    const batch = (operations: BatchOperation[]): LoadedBatch =>
      ({
        branch: "cadrage",
        repo: { specPath: null },
        operations,
        authorRole: "dev",
      }) as unknown as LoadedBatch;
    expect(integrityProblem(batch([op()]))).toBeUndefined();
    expect(integrityProblem(batch([{ ...op(), targetSpecId: "T-client" }]))).toBe("specId");
  });
});
