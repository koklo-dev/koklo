import { describe, expect, it } from "vitest";
import {
  type ArchitectureWarning,
  architectureChecks,
  checkSpec,
  parseSpecFiles,
  type SpecFile,
} from "../src/index.ts";
import { ADR_MD, archFiles, componentYaml, FLOW_YAML, PARCOURS } from "./architecture-helpers.ts";
import { codes, deepFreeze } from "./helpers.ts";

/** TK-111 lot A : références vérifiées à l'enregistrement (erreurs ARCH_*) et avertissements non bloquants (cas 2 et 4). */
const BASE: Record<string, string> = {
  "design/flows/P-inscription.yaml": PARCOURS,
  "architecture/components/api.yaml": componentYaml(
    "C-api",
    "possede: [T-user]\nsert: [F-001, F-004]\ndepend_de:\n  - { vers: C-db, via: SQL }\ndecisions: [ADR-001]\n",
  ),
  "architecture/components/db.yaml": componentYaml("C-db", "possede: [T-session]\n").replace(
    "service",
    "store",
  ),
  "architecture/flows/P-inscription.yaml": FLOW_YAML,
  "architecture/adr/ADR-001-base.md": ADR_MD,
};
const withArch = (changes: Record<string, string | null> = {}): SpecFile[] =>
  archFiles({ ...BASE, ...changes });
const archErrors = (files: SpecFile[]) =>
  checkSpec(files).issues.filter((issue) => issue.code.startsWith("ARCH_"));
const warningsOf = (files: SpecFile[]): ArchitectureWarning[] =>
  architectureChecks(parseSpecFiles(files).spec);
const only = (warnings: ArchitectureWarning[], code: string) =>
  warnings.filter((w) => w.code === code).map((w) => w.entityId);

describe("références d'architecture : erreurs ARCH_*", () => {
  it("une architecture cohérente n'a aucune erreur ni issue de structure", () => {
    const report = checkSpec(withArch());
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("composant : T-, F-, C- et ADR- inconnus, chacun avec son code, son pointeur et la règle 4", () => {
    const issues = archErrors(
      withArch({
        "architecture/components/api.yaml": componentYaml(
          "C-api",
          "possede: [T-absente]\nsert: [F-999]\ndepend_de:\n  - { vers: C-zzz, via: SQL }\ndecisions: [ADR-999]\n",
        ),
      }),
    );
    expect(codes(issues).sort()).toEqual([
      "ARCH_UNKNOWN_COMPONENT",
      "ARCH_UNKNOWN_DECISION",
      "ARCH_UNKNOWN_FEATURE",
      "ARCH_UNKNOWN_TABLE",
    ]);
    const byCode = Object.fromEntries(issues.map((i) => [i.code, i]));
    expect(byCode.ARCH_UNKNOWN_TABLE?.pointer).toBe("/possede/0");
    expect(byCode.ARCH_UNKNOWN_FEATURE?.pointer).toBe("/sert/0");
    expect(byCode.ARCH_UNKNOWN_COMPONENT?.pointer).toBe("/depend_de/0/vers");
    expect(byCode.ARCH_UNKNOWN_DECISION?.pointer).toBe("/decisions/0");
    for (const issue of issues) {
      expect(issue).toMatchObject({ rule: 4, severity: "error", entityId: "C-api" });
      expect(issue.path).toBe("architecture/components/api.yaml");
      expect(issue.message).toMatch(/n'existe pas/);
    }
  });

  it("flux technique : P- sans parcours, participant C- inconnu, F-, R-, ADR- inconnus", () => {
    const flow = FLOW_YAML.replace(
      "[RL-visiteur, C-api, C-db]",
      "[RL-visiteur, C-api, C-db, C-zzz]",
    )
      .replace("fonctionnalites: [F-001]", "fonctionnalites: [F-999]")
      .replace("regles: [R-003]", "regles: [R-999]")
      .replace("decisions: [ADR-001]", "decisions: [ADR-999]");
    const issues = archErrors(
      withArch({
        "design/flows/P-inscription.yaml": null,
        "architecture/flows/P-inscription.yaml": flow,
      }),
    );
    expect(codes(issues).sort()).toEqual([
      "ARCH_UNKNOWN_COMPONENT",
      "ARCH_UNKNOWN_DECISION",
      "ARCH_UNKNOWN_FEATURE",
      "ARCH_UNKNOWN_FLOW",
      "ARCH_UNKNOWN_RULE",
    ]);
    const flowIssue = issues.find((i) => i.code === "ARCH_UNKNOWN_FLOW");
    expect(flowIssue).toMatchObject({ pointer: "/id", entityId: "P-inscription" });
    expect(issues.find((i) => i.code === "ARCH_UNKNOWN_COMPONENT")?.pointer).toBe(
      "/participants/3",
    );
  });

  it("décision : liens F-, T-, C-, R-, P- et remplacee_par vérifiés", () => {
    const adr = ADR_MD.replace(
      "liens: [F-001, T-user]",
      "liens: [F-999, T-absente, C-zzz, R-999, P-zzz]",
    ).replace("statut: acceptee", "statut: remplacee\nremplacee_par: ADR-999");
    const issues = archErrors(withArch({ "architecture/adr/ADR-001-base.md": adr }));
    expect(codes(issues).sort()).toEqual([
      "ARCH_UNKNOWN_COMPONENT",
      "ARCH_UNKNOWN_DECISION",
      "ARCH_UNKNOWN_FEATURE",
      "ARCH_UNKNOWN_FLOW",
      "ARCH_UNKNOWN_RULE",
      "ARCH_UNKNOWN_TABLE",
    ]);
    expect(issues.find((i) => i.code === "ARCH_UNKNOWN_DECISION")?.pointer).toBe("/remplacee_par");
  });
});

describe("architectureChecks : avertissements non bloquants", () => {
  it("base cohérente : aucun avertissement", () => {
    expect(warningsOf(withArch())).toEqual([]);
  });

  it("table sans propriétaire", () => {
    const files = withArch({
      "architecture/components/db.yaml": componentYaml("C-db").replace("service", "store"),
    });
    expect(only(warningsOf(files), "ARCH_TABLE_UNOWNED")).toEqual(["T-session"]);
  });

  it("table possédée par deux composants", () => {
    const files = withArch({
      "architecture/components/db.yaml": componentYaml("C-db", "possede: [T-user, T-session]\n"),
    });
    expect(only(warningsOf(files), "ARCH_TABLE_MULTI_OWNER")).toEqual(["T-user"]);
  });

  it("composant externe qui possède une table", () => {
    const files = withArch({
      "architecture/components/db.yaml": componentYaml("C-db", "possede: [T-session]\n").replace(
        "service",
        "ext",
      ),
    });
    expect(only(warningsOf(files), "ARCH_EXT_OWNS_TABLE")).toEqual(["C-db"]);
  });

  it("fonctionnalité non servie", () => {
    const files = withArch({
      "architecture/components/api.yaml": componentYaml(
        "C-api",
        "possede: [T-user]\nsert: [F-001]\n",
      ),
    });
    expect(only(warningsOf(files), "ARCH_FEATURE_UNSERVED")).toEqual(["F-004"]);
  });

  it("parcours sans flux technique", () => {
    const files = withArch({ "architecture/flows/P-inscription.yaml": null });
    expect(only(warningsOf(files), "ARCH_FLOW_MISSING")).toEqual(["P-inscription"]);
  });

  const cycle = () =>
    withArch({
      "architecture/components/api.yaml": componentYaml(
        "C-api",
        `possede: [T-user]\nsert: [F-001, F-004]\ndepend_de:\n  - { vers: C-db, via: SQL }\n`,
      ),
      "architecture/components/db.yaml": componentYaml(
        "C-db",
        `possede: [T-session]\ndepend_de:\n  - { vers: C-api, via: rappel }\n`,
      ),
    });

  it("cycle synchrone signalé une fois, avec ses membres", () => {
    const warnings = warningsOf(cycle());
    expect(only(warnings, "ARCH_SYNC_CYCLE")).toEqual(["C-api"]);
    const message = warnings.find((w) => w.code === "ARCH_SYNC_CYCLE")?.message ?? "";
    expect(message).toContain("C-api");
    expect(message).toContain("C-db");
  });

  it("le cycle asynchrone est permis", () => {
    const files = withArch({
      "architecture/components/db.yaml": componentYaml(
        "C-db",
        "possede: [T-session]\ndepend_de:\n  - { vers: C-api, via: rappel, mode: asynchrone }\n",
      ),
    });
    expect(only(warningsOf(files), "ARCH_SYNC_CYCLE")).toEqual([]);
  });

  it("une dépendance d'un composant vers lui-même est un cycle synchrone", () => {
    const files = withArch({
      "architecture/components/db.yaml": componentYaml(
        "C-db",
        "possede: [T-session]\ndepend_de:\n  - { vers: C-db, via: SQL }\n",
      ),
    });
    expect(only(warningsOf(files), "ARCH_SYNC_CYCLE")).toEqual(["C-db"]);
  });

  it("jamais bloquant : aucun avertissement dans le rapport de validation, qui reste ok", () => {
    const report = checkSpec(cycle());
    expect(report.ok).toBe(true);
    expect(report.issues.some((i) => i.code.startsWith("ARCH_") && i.severity === "error")).toBe(
      false,
    );
  });

  it("pure et déterministe : n'altère pas l'entrée, triée par code puis identifiant", () => {
    const { spec } = parseSpecFiles(cycle());
    const frozen = deepFreeze(spec);
    const first = architectureChecks(frozen);
    expect(architectureChecks(frozen)).toEqual(first);
    const keys = first.map((w) => `${w.code}|${w.entityId}`);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("acteurs d'un composant (TK-114d, B650)", () => {
  it("un rôle inconnu de l'index est signalé comme dans sert, rôle connu admis", () => {
    const issues = checkSpec(
      withArch({
        "architecture/components/api.yaml": componentYaml(
          "C-api",
          "acteurs: [RL-visiteur, RL-fantome]\n",
        ).replace("service", "app"),
      }),
    ).issues.filter((issue) => issue.entityId === "C-api" && issue.severity === "error");
    expect(issues.map((issue) => [issue.code, issue.pointer])).toEqual([
      ["R4_UNKNOWN_ROLE", "/acteurs/1"],
    ]);
  });
});
