import { emitComponentYaml, parseSpecFiles } from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { integrityProblem } from "./paths.ts";
import { planBatch } from "./plan.ts";
import type { BatchOperation, LoadedBatch } from "./types.ts";

/**
 * TK-112 lot A (B542) : opération `architecture.layout.save` (pure) : écrit `architecture/_layout.yaml` trié par
 * identifiant (composants C-, acteurs RL-), sans toucher au schéma Mermaid ni aux composants ; le designer est refusé ;
 * aucun conflit (le dernier écrit gagne) ; positions invalides : SPEC_INVALID ; ne confond pas avec le `layout.save` des Données.
 */
const MANIFEST = {
  path: "koklo.project.yaml",
  content: "projet: demo\norganisation: acme\nspec_version: 2\n",
};
const COMPONENT = {
  path: "architecture/components/api.yaml",
  content: emitComponentYaml({
    id: "C-api",
    nom: "API",
    type: "service",
    zone: "Coeur",
    responsabilite: "Expose les procédures.",
    possede: [],
    sert: [],
    depend_de: [],
    decisions: [],
  }),
};
const BASE = [MANIFEST, COMPONENT];
const POSITIONS = { "RL-client": { x: 300, y: 40 }, "C-api": { x: 0, y: 8 } };
const FILE = "architecture/_layout.yaml";

const op = (payload: Record<string, unknown> = { positions: POSITIONS }): BatchOperation => ({
  position: 1,
  kind: "architecture.layout.save",
  targetSpecId: null,
  payload,
});
const plan = (operations: BatchOperation[], files = BASE, authorRole = "dev") =>
  planBatch({ operations, authorRole }, files);
const changes = (result: ReturnType<typeof plan>) => ("changes" in result ? result.changes : []);
const content = (result: ReturnType<typeof plan>, path = FILE) => {
  const change = changes(result).find((entry) => entry.path === path);
  return change && "content" in change ? change.content : "";
};

describe("architecture.layout.save", () => {
  it.each(["owner", "admin", "dev"])(
    "%s : écrit architecture/_layout.yaml, rien d'autre",
    (role) => {
      const result = plan([op()], BASE, role);
      expect(changes(result).map((c) => c.path)).toEqual([FILE]);
      expect(content(result)).toBe(
        "positions:\n  C-api:\n    x: 0\n    y: 8\n  RL-client:\n    x: 300\n    y: 40\n",
      );
    },
  );

  it("ne touche ni data/_layout.yaml ni les composants ; la spec reste valide", () => {
    const result = plan([op()]);
    expect(changes(result).map((c) => c.path)).not.toContain("data/_layout.yaml");
    expect(changes(result).map((c) => c.path)).not.toContain(COMPONENT.path);
    const { issues } = parseSpecFiles([...BASE, { path: FILE, content: content(result) }]);
    expect(issues).toEqual([]);
  });

  it("remplace un fichier déjà présent : pas de conflit, le dernier écrit gagne", () => {
    const files = [...BASE, { path: FILE, content: "positions: {}\n" }];
    const result = plan([op({ positions: { "C-api": { x: 5, y: 6 } } })], files);
    expect("outcome" in result).toBe(false);
    expect(content(result)).toContain("x: 5");
  });

  it("le designer est refusé (FORBIDDEN) sans aucun changement", () => {
    expect(plan([op()], BASE, "designer")).toEqual({
      outcome: expect.objectContaining({ errorCode: "FORBIDDEN" }),
    });
  });

  it("positions invalides (négative, hors bornes, identifiant de table, absentes) : SPEC_INVALID", () => {
    const invalid = [
      { "C-a": { x: -1, y: 0 } },
      { "C-a": { x: 0, y: 20001 } },
      { "T-a": { x: 0, y: 0 } },
    ];
    for (const positions of invalid) {
      expect(plan([op({ positions })])).toEqual({
        outcome: expect.objectContaining({ errorCode: "SPEC_INVALID" }),
      });
    }
    expect(plan([op({})])).toEqual({
      outcome: expect.objectContaining({ errorCode: "SPEC_INVALID" }),
    });
  });

  it("intégrité : genre connu, sans identifiant cible ; un identifiant cible est refusé", () => {
    const batch = (operations: BatchOperation[]): LoadedBatch =>
      ({
        branch: "cadrage",
        repo: { specPath: null },
        operations,
        authorRole: "dev",
      }) as unknown as LoadedBatch;
    expect(integrityProblem(batch([op()]))).toBeUndefined();
    expect(integrityProblem(batch([{ ...op(), targetSpecId: "C-api" }]))).toBe("specId");
  });
});
