import { describe, expect, it } from "vitest";
import {
  checkSpec,
  emitFeatureMarkdown,
  FeatureSchema,
  parseFeatureMarkdown,
  parseSpecFiles,
  validateSpec,
} from "../src/index.ts";
import { codes, validFile, withFiles } from "./helpers.ts";

/**
 * TK-53a : `R5_CRITERION_INCOMPLETE` (règle 5, erreur) — contrôle de l'ordre et de la présence des
 * étapes d'un critère. Décisions : .workflow/TK-53/02-decisions-53a.md.
 * Grammaire : une étape `et` prend le rôle de l'étape précédente ; la suite des rôles doit être
 * croissante (etant_donne < quand < alors) et contenir au moins un de chaque. Tolérant en
 * `brouillon`, strict dès `specifiee` (specifiee, implementee, adoptee). Une seule issue par critère
 * (la première faute), pointeur `/criteres/<i>/etapes/<j>` pour une étape mal placée,
 * `/criteres/<i>/etapes` pour une étape manquante ou une liste vide. Aucune contrainte Zod ajoutée.
 */
const CODE = "R5_CRITERION_INCOMPLETE";
const F5 = "features/F-005-criteres.md";
const GD = "- **Étant donné** un état";
const Q = "- **Quand** une action";
const A = "- **Alors** un résultat";
const ET = "- **Et** un détail";

type Steps = readonly string[];

function feature(statut: string, criteria: readonly Steps[]): string {
  const head = `---\nid: F-005\ntitre: Critères\nstatut: ${statut}\npriorite: should\necrans: [S-register]\n---\n\n## Description\nTest.\n\n## Critères d'acceptation\n`;
  const body = criteria.map((steps, i) => `\n### AC-${i + 1} — Cas ${i + 1}\n${steps.join("\n")}`);
  return `${head}${body.join("\n")}\n`;
}

const r5 = (statut: string, criteria: readonly Steps[]) =>
  checkSpec(withFiles({ [F5]: feature(statut, criteria) })).issues.filter((i) => i.code === CODE);

const STRICT = ["specifiee", "implementee", "adoptee"] as const;

const invalid: { name: string; steps: Steps; pointer: string }[] = [
  { name: "aucune étape", steps: [], pointer: "/criteres/0/etapes" },
  { name: "Étant donné absent", steps: [Q, A], pointer: "/criteres/0/etapes" },
  { name: "Quand absent", steps: [GD, A], pointer: "/criteres/0/etapes" },
  { name: "Alors absent", steps: [GD, Q], pointer: "/criteres/0/etapes" },
  { name: "Alors seul", steps: [A], pointer: "/criteres/0/etapes" },
  {
    name: "Et seul en tête (pas d'étape précédente)",
    steps: [ET, GD, Q, A],
    pointer: "/criteres/0/etapes/0",
  },
  { name: "Et en tête puis Quand/Alors", steps: [ET, Q, A], pointer: "/criteres/0/etapes/0" },
  { name: "Quand avant Étant donné", steps: [Q, GD, A], pointer: "/criteres/0/etapes/1" },
  { name: "Alors avant Quand", steps: [GD, A, Q], pointer: "/criteres/0/etapes/2" },
  {
    name: "Alors avant Quand (Et rattaché à Alors)",
    steps: [GD, Q, A, ET, Q],
    pointer: "/criteres/0/etapes/4",
  },
  { name: "Étant donné après Alors", steps: [GD, Q, A, GD], pointer: "/criteres/0/etapes/3" },
  { name: "Quand répété après Alors", steps: [GD, Q, A, Q, A], pointer: "/criteres/0/etapes/3" },
  {
    name: "Étant donné après Quand (Et rattaché à Quand)",
    steps: [GD, Q, ET, GD, A],
    pointer: "/criteres/0/etapes/3",
  },
];

describe("R5_CRITERION_INCOMPLETE : critères valides", () => {
  it.each([
    ["forme minimale", [GD, Q, A]],
    ["Et après chaque étape", [GD, ET, ET, Q, ET, A, ET]],
    ["étapes répétées du même type", [GD, GD, Q, Q, A, A]],
  ] as [string, Steps][])("%s : aucune issue dès specifiee", (_name, steps) => {
    for (const statut of STRICT) expect(r5(statut, [steps])).toEqual([]);
  });

  it("la fixture F-004 (cas limites valides) ne produit aucune issue", () => {
    const report = checkSpec(withFiles({}));
    expect(report).toEqual({ ok: true, counts: { error: 0, warning: 0 }, issues: [] });
    expect(parseSpecFiles(withFiles({})).spec.features.map((f) => f.value.id)).toContain("F-004");
  });

  it("la fixture F-004 est réémise à l'octet près (émission inchangée)", () => {
    const path = "features/F-004-criteres-structures.md";
    const parsed = parseFeatureMarkdown(path, validFile(path));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(emitFeatureMarkdown(parsed.value)).toBe(validFile(path));
  });

  it("F-001 (fixture de référence) reste valide", () => {
    const features = parseSpecFiles(withFiles({})).spec.features;
    expect(features.find((f) => f.value.id === "F-001")?.value.criteres).toHaveLength(3);
    expect(checkSpec(withFiles({})).ok).toBe(true);
  });
});

describe.each(invalid)("R5_CRITERION_INCOMPLETE : $name", ({ steps, pointer }) => {
  it.each(STRICT)("signale le critère dès %s, avec le pointeur exact", (statut) => {
    const issues = r5(statut, [steps]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      rule: 5,
      code: CODE,
      severity: "error",
      path: F5,
      pointer,
      entityId: "F-005",
    });
    expect(issues[0]?.message).toContain("AC-1");
  });

  it("est toléré en brouillon : aucune issue R5_CRITERION_INCOMPLETE, rapport ok", () => {
    const report = checkSpec(withFiles({ [F5]: feature("brouillon", [steps]) }));
    expect(codes(report.issues)).not.toContain(CODE);
    expect(report.ok).toBe(true);
  });
});

describe("R5_CRITERION_INCOMPLETE : portée et rapport", () => {
  it("invalide le rapport dès specifiee", () => {
    const report = checkSpec(withFiles({ [F5]: feature("specifiee", [[GD, Q]]) }));
    expect(report.ok).toBe(false);
    expect(report.counts.error).toBe(1);
  });

  it("le même contenu passe de toléré (brouillon) à refusé (specifiee) sans autre différence", () => {
    const bad: Steps = [A, Q];
    expect(r5("brouillon", [bad])).toEqual([]);
    expect(r5("specifiee", [bad])).toHaveLength(1);
  });

  it("une issue par critère fautif, pointeur au bon indice, critères valides ignorés", () => {
    const issues = r5("specifiee", [
      [GD, Q, A],
      [GD, Q],
      [GD, Q, A],
      [A, Q, GD],
      [Q, GD, A],
    ]);
    expect(issues.map((i) => i.pointer)).toEqual([
      "/criteres/1/etapes",
      "/criteres/3/etapes/1",
      "/criteres/4/etapes/1",
    ]);
    expect(issues.map((i) => i.message.match(/AC-\d+/)?.[0])).toEqual(["AC-2", "AC-4", "AC-5"]);
  });

  it("au plus une issue par critère : la première faute (étape mal placée avant étape manquante)", () => {
    const issues = r5("specifiee", [[ET, A, GD]]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.pointer).toBe("/criteres/0/etapes/0");
  });

  it("une feature sans critère n'est pas concernée (pas de R5_CRITERION_INCOMPLETE)", () => {
    expect(r5("specifiee", [])).toEqual([]);
  });

  it("implementee : cumule avec l'absence de test sans se confondre", () => {
    const report = checkSpec(withFiles({ [F5]: feature("implementee", [[GD, Q]]) }));
    expect(codes(report.issues).sort()).toEqual([CODE, "R5_IMPLEMENTED_CRITERION_WITHOUT_TEST"]);
  });

  it("validateSpec(parseSpecFiles(f).spec) donne le même rapport que checkSpec(f)", () => {
    const files = withFiles({ [F5]: feature("specifiee", [[A, Q]]) });
    expect(validateSpec(parseSpecFiles(files).spec)).toEqual(checkSpec(files));
  });
});

describe("R5_CRITERION_INCOMPLETE : le parseur et le schéma Zod restent tolérants", () => {
  it("parseSpecFiles n'émet aucune issue de structure pour des étapes mal ordonnées", () => {
    const files = withFiles({ [F5]: feature("specifiee", [[A, Q], []]) });
    expect(parseSpecFiles(files).issues).toEqual([]);
  });

  it("FeatureSchema accepte etapes vide ou désordonnées (la règle 5 contrôle, pas Zod)", () => {
    const base = {
      id: "F-005",
      titre: "t",
      statut: "specifiee",
      priorite: "must",
      description: "",
    };
    const steps = [
      { type: "alors", texte: "x" },
      { type: "et", texte: "y" },
    ];
    const criteres = [
      { id: "AC-1", titre: "a", etapes: [] },
      { id: "AC-2", titre: "b", etapes: steps },
    ];
    expect(FeatureSchema.safeParse({ ...base, criteres }).success).toBe(true);
  });
});
