import { emitFlowYaml, emitRolesYaml, emitRuleMarkdown, parseSpecFiles } from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { entityRowsOf } from "./entity-rows.ts";
import { ruleCounterOf } from "./index-rows.ts";

/** TK-103 lot A : lignes `spec_entities` des règles (tri numérique), rôles, parcours YAML et JSON hérité ; jamais d'échec d'index. */
const rule = (n: number, over: Record<string, unknown> = {}) => ({
  path: `domain/rules/R-${String(n).padStart(3, "0")}-x.md`,
  content: emitRuleMarkdown({
    id: `R-${String(n).padStart(3, "0")}`,
    titre: `Règle ${n}`,
    type: "contrainte",
    tables: [],
    endpoints: [],
    enonce: "Énoncé.",
    exemples: [],
    ...over,
  }),
});
const flowPath = "design/flows/P-inscription.yaml";
const flow = {
  path: flowPath,
  content: emitFlowYaml({
    id: "P-inscription",
    titre: "Inscription",
    acteur: "Visiteur",
    depart: { libelle: "Ouvrir" },
    etapes: [{ libelle: "Remplir" }],
    erreurs: [],
    fonctionnalites: [],
  }),
};
const roles = {
  path: "domain/roles.yaml",
  content: emitRolesYaml({
    roles: [{ id: "RL-a", nom: "A", description: "Rôle A", permissions: [] }],
    permissions: [],
  }),
};
const rowsFor = (files: { path: string; content: string }[]) => {
  const { spec } = parseSpecFiles(files);
  const legacy = files.filter((f) => f.path.endsWith(".json"));
  return entityRowsOf(spec, legacy);
};
const of = (rows: ReturnType<typeof rowsFor>, kind: string) => rows.filter((r) => r.kind === kind);

describe("entityRowsOf : règles, rôles, parcours", () => {
  it("règles triées par numéro : R-999 avant R-1000 (sort croissant)", () => {
    const rows = of(rowsFor([rule(1000), rule(999), rule(2)]), "rule");
    expect(rows.map((r) => r.specId)).toEqual(["R-002", "R-999", "R-1000"]);
    expect(rows.map((r) => r.sort)).toEqual([0, 1, 2]);
    expect(rows[0]?.data).toMatchObject({ titre: "Règle 2" });
  });

  it("une règle sans titre reçoit en index le début de son énoncé", () => {
    const old = {
      path: "domain/rules/R-003-ancienne.md",
      content:
        "---\nid: R-003\ntype: contrainte\n---\n\n## Énoncé\nL'email est unique. Toujours.\n\n## Exemples\n",
    };
    const [row] = of(rowsFor([old]), "rule");
    expect(row?.data).toMatchObject({ id: "R-003" });
    expect((row?.data as { titre: string } | undefined)?.titre).toBe("L'email est unique.");
  });

  it("le fichier de rôles est une ligne roles avec un titre ; le parcours YAML une ligne flow avec titre", () => {
    const rows = rowsFor([roles, flow]);
    expect(of(rows, "roles")).toMatchObject([
      { specId: "roles", path: "domain/roles.yaml", data: { titre: "Rôles et permissions" } },
    ]);
    expect(of(rows, "flow")).toMatchObject([
      {
        specId: "P-inscription",
        path: flowPath,
        data: { titre: "Inscription", acteur: "Visiteur" },
      },
    ]);
  });

  it("un parcours .json hérité est encore lu (id du JSON), un .yaml invalide est ignoré", () => {
    const legacy = {
      path: "design/flows/P-001-inscription.json",
      content: JSON.stringify({ id: "P-001", titre: "Hérité", etapes: ["S-a"] }),
    };
    const broken = { path: "design/flows/P-cassé.yaml", content: "id: [\n" };
    const rows = of(rowsFor([legacy, broken, flow]), "flow");
    expect(rows.map((r) => r.specId).sort()).toEqual(["P-001", "P-inscription"]);
  });

  it("un fichier de règle invalide n'empêche pas l'index des autres", () => {
    const rows = of(
      rowsFor([{ path: "domain/rules/R-005-x.md", content: "rien" }, rule(1)]),
      "rule",
    );
    expect(rows.map((r) => r.specId)).toEqual(["R-001"]);
  });
});

describe("ruleCounterOf", () => {
  it("relève le compteur au plus grand R-nnn et compte les identifiants trop grands", () => {
    const { spec } = parseSpecFiles([rule(3), rule(12)]);
    expect(ruleCounterOf(spec)).toEqual({ raiseTo: 12, skipped: 0 });
    expect(ruleCounterOf(parseSpecFiles([]).spec)).toEqual({ skipped: 0 });
  });
});
