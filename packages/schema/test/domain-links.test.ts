import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Issue } from "../src/index.ts";
import {
  checkSpec,
  emitFeatureMarkdown,
  ISSUE_CODES,
  jsonSchemas,
  parseFeatureMarkdown,
  parseSpecFiles,
  ScreenSchema,
  validateSpec,
} from "../src/index.ts";
import { codes, deepFreeze, patch, validFile, validFiles, withFiles } from "./helpers.ts";

/**
 * TK-53b : règle 4 (liens rôles / permissions / règles) et règle 7 (orphelins), compatibilité.
 * Décisions : .workflow/TK-53/03-decisions-53b.md §4 à §6 et §9.
 */
const FEATURE = "features/F-001-inscription.md";
const F4 = "features/F-004-criteres-structures.md";
const SCREEN = "design/screens/S-register.json";
const ROLES = "domain/roles.yaml";
const RULE = "domain/rules/R-003-email-unique.md";
const SPEC_ROOT = resolve(import.meta.dirname, "../../..");

const only = (files: ReturnType<typeof withFiles>, code: string): Issue[] =>
  checkSpec(files).issues.filter((i) => i.code === code);

describe("compatibilité : la spec valide complète", () => {
  it("reste valide, sans erreur ni avertissement (F-001 cite RL-visiteur et R-003, qui existent)", () => {
    expect(checkSpec(validFiles())).toEqual({
      ok: true,
      counts: { error: 0, warning: 0 },
      issues: [],
    });
  });

  it("le snapshot expose roles et rules", () => {
    const { spec } = parseSpecFiles(validFiles());
    expect(spec.roles.map((r) => r.path)).toEqual([ROLES]);
    expect(spec.rules.map((r) => r.path)).toEqual([RULE]);
    expect(spec.screens.map((s) => s.value.roles)).toEqual([
      ["RL-visiteur"],
      ["RL-visiteur", "RL-admin"],
    ]);
  });

  it("une spec sans domain/ a roles et rules vides", () => {
    const { spec } = parseSpecFiles([
      { path: "koklo.project.yaml", content: validFile("koklo.project.yaml") },
    ]);
    expect(spec.roles).toEqual([]);
    expect(spec.rules).toEqual([]);
  });

  it("F-004 (53a) n'a ni rôle ni règle ; l'émission d'une feature est inchangée", () => {
    const f4 = validFile(F4);
    expect(f4).toMatch(/^roles: \[\]$/m);
    expect(f4).toMatch(/^regles: \[\]$/m);
    const parsed = parseFeatureMarkdown(F4, f4);
    expect(parsed.ok && emitFeatureMarkdown(parsed.value)).toBe(f4);
    const f1 = parseFeatureMarkdown(FEATURE, validFile(FEATURE));
    expect(f1.ok).toBe(true);
    if (f1.ok) {
      const once = emitFeatureMarkdown(f1.value);
      const again = parseFeatureMarkdown(FEATURE, once);
      expect(again.ok && emitFeatureMarkdown(again.value)).toBe(once);
    }
  });

  it("ScreenSchema : roles optionnel (défaut []), motif RL-… exigé", () => {
    const base = { id: "S-x", arbre: { composant: "C-page" } };
    expect(ScreenSchema.parse(base).roles).toEqual([]);
    expect(ScreenSchema.parse({ ...base, roles: ["RL-visiteur"] }).roles).toEqual(["RL-visiteur"]);
    expect(ScreenSchema.safeParse({ ...base, roles: ["RL-Bad"] }).success).toBe(false);
  });

  it("l'ordre des fichiers n'a pas d'effet sur le rapport, les entrées gelées ne sont pas mutées", () => {
    const files = deepFreeze(withFiles({ [ROLES]: "roles: []\n" }));
    expect(checkSpec([...files].reverse())).toEqual(checkSpec(files));
    const { spec } = parseSpecFiles(validFiles());
    expect(validateSpec(deepFreeze(spec))).toEqual(checkSpec(validFiles()));
  });

  it("ISSUE_CODES : 33 codes dont les six nouveaux, README et docs à jour", () => {
    expect(Object.keys(ISSUE_CODES)).toHaveLength(33);
    for (const code of [
      "R4_UNKNOWN_ROLE",
      "R4_UNKNOWN_PERMISSION",
      "R4_UNKNOWN_RULE",
      "R7_ORPHAN_ROLE",
      "R7_ORPHAN_PERMISSION",
      "R7_ORPHAN_RULE",
    ])
      expect(ISSUE_CODES[code as keyof typeof ISSUE_CODES], code).toBe(code);
    const readme = readFileSync(resolve(import.meta.dirname, "../README.md"), "utf8");
    expect(readme).toContain("Les 33 codes de `ISSUE_CODES`");
    for (const code of [
      "R4_UNKNOWN_ROLE",
      "R4_UNKNOWN_PERMISSION",
      "R4_UNKNOWN_RULE",
      "R7_ORPHAN_ROLE",
      "R7_ORPHAN_PERMISSION",
      "R7_ORPHAN_RULE",
    ])
      expect(readme, code).toContain(code);
    const domainDoc = readFileSync(resolve(SPEC_ROOT, "docs/domain-model.md"), "utf8");
    expect(domainDoc).toContain("the 33 issue codes");
    expect(domainDoc).not.toContain("the 27 issue codes");
  });

  it("JSON Schema : roles et rule publiés, screen porte roles", () => {
    expect(Object.keys(jsonSchemas)).toEqual(expect.arrayContaining(["roles", "rule"]));
    expect(JSON.stringify(jsonSchemas.screen)).toContain('"roles"');
  });
});

type Link = {
  name: string;
  code: string;
  files: ReturnType<typeof withFiles>;
  expected: Pick<Issue, "path" | "pointer" | "entityId">;
};

const rolesPatch = (from: string, to: string) => ({ [ROLES]: patch(ROLES, from, to) });

const LINKS: Link[] = [
  {
    name: "feature -> rôle inexistant",
    code: "R4_UNKNOWN_ROLE",
    files: withFiles({
      [FEATURE]: patch(FEATURE, "roles: [RL-visiteur]", "roles: [RL-visiteur, RL-fantome]"),
    }),
    expected: { path: FEATURE, pointer: "/roles/1", entityId: "F-001" },
  },
  {
    name: "écran -> rôle inexistant",
    code: "R4_UNKNOWN_ROLE",
    files: withFiles({
      [SCREEN]: patch(SCREEN, '"roles": ["RL-visiteur"]', '"roles": ["RL-visiteur", "RL-fantome"]'),
    }),
    expected: { path: SCREEN, pointer: "/roles/1", entityId: "S-register" },
  },
  {
    name: "feature -> règle inexistante",
    code: "R4_UNKNOWN_RULE",
    files: withFiles({ [FEATURE]: patch(FEATURE, "regles: [R-003]", "regles: [R-003, R-999]") }),
    expected: { path: FEATURE, pointer: "/regles/1", entityId: "F-001" },
  },
  {
    name: "rôle -> permission inexistante",
    code: "R4_UNKNOWN_PERMISSION",
    files: withFiles(
      rolesPatch("permissions: [PM-compte.creer]", "permissions: [PM-compte.creer, PM-fantome]"),
    ),
    expected: { path: ROLES, pointer: "/roles/0/permissions/1", entityId: "RL-visiteur" },
  },
  {
    name: "permission -> ressource table inexistante",
    code: "R4_UNKNOWN_TABLE",
    files: withFiles(
      rolesPatch("ressource: T-user\n    conditions", "ressource: T-ghost\n    conditions"),
    ),
    expected: { path: ROLES, pointer: "/permissions/0/ressource", entityId: "PM-compte.creer" },
  },
  {
    name: "permission -> ressource endpoint inexistant",
    code: "R4_UNKNOWN_ENDPOINT",
    files: withFiles(
      rolesPatch("ressource: T-user\n    conditions", "ressource: E-ghost\n    conditions"),
    ),
    expected: { path: ROLES, pointer: "/permissions/0/ressource", entityId: "PM-compte.creer" },
  },
  {
    name: "permission -> endpoint inexistant",
    code: "R4_UNKNOWN_ENDPOINT",
    files: withFiles(
      rolesPatch("endpoints: [E-auth-register]", "endpoints: [E-auth-register, E-ghost]"),
    ),
    expected: { path: ROLES, pointer: "/permissions/0/endpoints/1", entityId: "PM-compte.creer" },
  },
  {
    name: "règle -> table inexistante",
    code: "R4_UNKNOWN_TABLE",
    files: withFiles({ [RULE]: patch(RULE, "tables: [T-user]", "tables: [T-user, T-ghost]") }),
    expected: { path: RULE, pointer: "/tables/1", entityId: "R-003" },
  },
  {
    name: "règle -> endpoint inexistant",
    code: "R4_UNKNOWN_ENDPOINT",
    files: withFiles({
      [RULE]: patch(RULE, "endpoints: [E-auth-register]", "endpoints: [E-auth-register, E-ghost]"),
    }),
    expected: { path: RULE, pointer: "/endpoints/1", entityId: "R-003" },
  },
];

describe("règle 4 : liens rôles, permissions et règles", () => {
  it.each(LINKS)("$name : erreur $code, un seul diagnostic", ({ code, files, expected }) => {
    const report = checkSpec(files);
    expect(codes(report.issues)).toEqual([code]);
    expect(report.issues[0]).toMatchObject({ rule: 4, severity: "error", ...expected });
    expect(report.ok).toBe(false);
  });

  it("D4 : sans domain/roles.yaml, chaque rôle cité est une erreur R4_UNKNOWN_ROLE", () => {
    const issues = only(withFiles({ [ROLES]: null }), "R4_UNKNOWN_ROLE");
    // Correction d'une erreur manifeste du Red : `.sort()` range `design/` avant `features/`.
    expect(issues.map((i) => `${i.path}${i.pointer}`).sort()).toEqual([
      "design/screens/S-register-success.json/roles/0",
      "design/screens/S-register-success.json/roles/1",
      `${SCREEN}/roles/0`,
      `${FEATURE}/roles/0`,
    ]);
    expect(issues.every((i) => i.severity === "error")).toBe(true);
  });

  it("D4 : le scaffold `roles: []` rend les rôles cités inconnus (erreurs)", () => {
    const report = checkSpec(withFiles({ [ROLES]: "roles: []\n" }));
    expect(report.ok).toBe(false);
    expect(codes(report.issues).filter((c) => c === "R4_UNKNOWN_ROLE")).toHaveLength(4);
  });

  it("sans fichier de règle, R-003 cité par la feature est inconnu", () => {
    const issues = only(withFiles({ [RULE]: null }), "R4_UNKNOWN_RULE");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ path: FEATURE, pointer: "/regles/0", entityId: "F-001" });
  });

  it("un fichier roles.yaml invalide ne cache pas les liens : rôles cités inconnus", () => {
    const report = checkSpec(withFiles({ [ROLES]: "roles: [\n" }));
    expect(codes(report.issues)).toContain("STRUCT_YAML_SYNTAX");
    expect(codes(report.issues)).toContain("R4_UNKNOWN_ROLE");
  });

  it("une permission dont la ressource est un endpoint existant est valide", () => {
    const files = withFiles(
      rolesPatch("ressource: T-user\n    conditions", "ressource: E-auth-register\n    conditions"),
    );
    expect(checkSpec(files).issues).toEqual([]);
  });

  it("R-1000 (4 chiffres) cité par une feature se résout", () => {
    const rule1000 = validFile(RULE).replace("id: R-003", "id: R-1000");
    const files = withFiles({
      "domain/rules/R-1000-quatre.md": rule1000,
      [FEATURE]: patch(FEATURE, "regles: [R-003]", "regles: [R-003, R-1000]"),
    });
    expect(checkSpec(files).issues).toEqual([]);
  });
});

const EXTRA_ROLE = "  - id: RL-extra\n    nom: Extra\n";
const ORPHANS: Link[] = [
  {
    name: "rôle cité par aucune feature ni aucun écran",
    code: "R7_ORPHAN_ROLE",
    files: withFiles(
      rolesPatch(
        "permissions: [PM-compte.supprimer]\npermissions:",
        `permissions: [PM-compte.supprimer]\n${EXTRA_ROLE}permissions:`,
      ),
    ),
    expected: { path: ROLES, pointer: "/roles/2", entityId: "RL-extra" },
  },
  {
    name: "permission détenue par aucun rôle",
    code: "R7_ORPHAN_PERMISSION",
    files: withFiles({
      [ROLES]: `${validFile(ROLES)}  - id: PM-compte.lire\n    action: lire\n    ressource: T-user\n`,
    }),
    expected: { path: ROLES, pointer: "/permissions/2", entityId: "PM-compte.lire" },
  },
  {
    name: "règle citée par aucune feature",
    code: "R7_ORPHAN_RULE",
    files: withFiles({
      "domain/rules/R-005-extra.md": validFile(RULE).replace("id: R-003", "id: R-005"),
    }),
    expected: { path: "domain/rules/R-005-extra.md", pointer: "", entityId: "R-005" },
  },
];

describe("règle 7 : rôles, permissions et règles orphelins", () => {
  it.each(ORPHANS)(
    "$name : avertissement $code, le rapport reste ok",
    ({ code, files, expected }) => {
      const report = checkSpec(files);
      expect(codes(report.issues)).toEqual([code]);
      expect(report.issues[0]).toMatchObject({ rule: 7, severity: "warning", ...expected });
      expect(report).toMatchObject({ ok: true, counts: { error: 0, warning: 1 } });
    },
  );

  it("un rôle cité seulement par une feature (plus par un écran) n'est pas orphelin", () => {
    const files = withFiles({
      "design/screens/S-register-success.json": patch(
        "design/screens/S-register-success.json",
        '"roles": ["RL-visiteur", "RL-admin"],',
        '"roles": ["RL-visiteur"],',
      ),
      [FEATURE]: patch(FEATURE, "roles: [RL-visiteur]", "roles: [RL-visiteur, RL-admin]"),
    });
    expect(checkSpec(files).issues).toEqual([]);
  });

  it("un rôle cité seulement par un écran (RL-admin) n'est pas orphelin", () => {
    expect(only(withFiles({}), "R7_ORPHAN_ROLE")).toEqual([]);
  });

  it("rôle, permission ou règle jamais cité(e) mais dans un fichier invalide : pas d'avertissement fantôme", () => {
    const issues = checkSpec(withFiles({ [ROLES]: "roles: [\n" })).issues;
    expect(
      codes(issues).filter((c) => c.startsWith("R7_ORPHAN_ROLE") || c === "R7_ORPHAN_PERMISSION"),
    ).toEqual([]);
  });
});
