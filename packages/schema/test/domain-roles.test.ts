import { describe, expect, it } from "vitest";
import { checkSpec, kindOf, parseSpecFiles } from "../src/index.ts";
import { codes, deepFreeze, validFile, withFiles } from "./helpers.ts";

/**
 * TK-53b : parseur de `domain/roles.yaml` ({ roles, permissions }). Décisions :
 * .workflow/TK-53/03-decisions-53b.md §1 à §3.
 */
const ROLES = "domain/roles.yaml";
const parseRoles = (content: string) => parseSpecFiles([{ path: ROLES, content }]);

const role = (extra = "") =>
  `roles:\n  - id: RL-visiteur\n    nom: Visiteur\n${extra}permissions: []\n`;
const perm = (lines: string) => `roles: []\npermissions:\n  - id: PM-compte.creer\n${lines}`;
const PERM_OK = "    action: creer\n    ressource: T-user\n";

describe("kindOf : domain/roles.yaml", () => {
  it("reconnaît le chemin exact, rien d'autre sous domain/", () => {
    expect(kindOf(ROLES)).toBe("roles");
    for (const other of [
      "domain/roles.yml",
      "domain/sub/roles.yaml",
      "roles.yaml",
      "domain/Roles.yaml",
      "domain/rules/.gitkeep",
    ])
      expect(kindOf(other), other).toBeUndefined();
  });
});

describe("parseur de domain/roles.yaml : cas valides", () => {
  it("fixture valide : 2 rôles, 2 permissions, défauts appliqués", () => {
    const { spec, issues } = parseSpecFiles([{ path: ROLES, content: validFile(ROLES) }]);
    expect(issues).toEqual([]);
    expect(spec.roles).toHaveLength(1);
    expect(spec.roles[0]?.path).toBe(ROLES);
    const file = spec.roles[0]?.value;
    expect(file?.roles.map((r) => r.id)).toEqual(["RL-visiteur", "RL-admin"]);
    expect(file?.roles[0]).toEqual({
      id: "RL-visiteur",
      nom: "Visiteur",
      description: "Personne non connectée qui crée un compte.",
      permissions: ["PM-compte.creer"],
    });
    expect(file?.permissions[0]).toEqual({
      id: "PM-compte.creer",
      action: "creer",
      ressource: "T-user",
      conditions: ["L'email n'est pas déjà utilisé"],
      endpoints: ["E-auth-register"],
    });
    expect(file?.permissions[1]).toEqual({
      id: "PM-compte.supprimer",
      action: "supprimer",
      ressource: "T-user",
      conditions: [],
      endpoints: [],
    });
  });

  it.each([
    ["scaffold de l'API (roles: [])", "roles: []\n"],
    ["objet vide", "{}\n"],
    ["permissions seules", "permissions: []\n"],
    ["listes vides", "roles: []\npermissions: []\n"],
  ])("%s : valide, deux listes vides", (_n, content) => {
    const { spec, issues } = parseRoles(content);
    expect(issues).toEqual([]);
    expect(spec.roles[0]?.value).toEqual({ roles: [], permissions: [] });
  });

  it("rôle sans description ni permissions : valide", () => {
    const { spec, issues } = parseRoles("roles:\n  - { id: RL-x, nom: X }\n");
    expect(issues).toEqual([]);
    expect(spec.roles[0]?.value.roles[0]).toEqual({ id: "RL-x", nom: "X", permissions: [] });
  });

  it.each(["lire", "creer", "modifier", "supprimer", "executer"])(
    "action %s acceptée",
    (action) => {
      const { issues } = parseRoles(perm(`    action: ${action}\n    ressource: T-user\n`));
      expect(issues).toEqual([]);
    },
  );

  it.each(["T-user", "E-auth-register"])("ressource %s (table ou endpoint) acceptée", (r) => {
    expect(parseRoles(perm(`    action: lire\n    ressource: ${r}\n`)).issues).toEqual([]);
  });

  it.each(["PM-compte.creer", "PM-a", "PM-a.b.c", "PM-x1-y.z2"])("id de permission %s", (id) => {
    const content = `roles: []\npermissions:\n  - { id: ${id}, action: lire, ressource: T-user }\n`;
    expect(parseRoles(content).issues).toEqual([]);
  });

  it("CRLF, BOM et accents donnent la même valeur que LF", () => {
    const lf = validFile(ROLES);
    const reference = parseRoles(lf).spec.roles[0]?.value;
    expect(parseRoles(lf.replaceAll("\n", "\r\n")).spec.roles[0]?.value).toEqual(reference);
    expect(parseRoles(`﻿${lf}`).spec.roles[0]?.value).toEqual(reference);
    expect(reference?.roles[1]?.description).toContain("l'application livrée");
  });

  it("est déterministe et ne mute pas une entrée gelée", () => {
    const files = deepFreeze([{ path: ROLES, content: validFile(ROLES) }]);
    expect(parseSpecFiles(files)).toEqual(parseSpecFiles(files));
  });
});

type Bad = { name: string; content: string; code: string; pointer: string };
const schemaBad = (name: string, content: string, pointer: string): Bad => ({
  name,
  content,
  code: "STRUCT_SCHEMA_VIOLATION",
  pointer,
});

const BAD: Bad[] = [
  schemaBad("id de rôle avec majuscule", role().replace("RL-visiteur", "RL-Bad"), "/roles/0/id"),
  schemaBad("id de rôle sans préfixe", role().replace("RL-visiteur", "visiteur"), "/roles/0/id"),
  schemaBad("rôle sans nom", "roles:\n  - id: RL-x\n", "/roles/0/nom"),
  schemaBad("nom de rôle vide", 'roles:\n  - { id: RL-x, nom: "" }\n', "/roles/0/nom"),
  schemaBad("clé inconnue sur un rôle", role("    extra: 1\n"), "/roles/0"),
  schemaBad("clé inconnue à la racine", "roles: []\ngroupes: []\n", ""),
  schemaBad(
    "permissions d'un rôle mal formées",
    // Correction d'une erreur manifeste du Red : `role()` place `permissions: []` à la racine
    // (colonne 0), donc le remplacement visait la liste de permissions, pas celle du rôle.
    "roles:\n  - { id: RL-visiteur, nom: Visiteur, permissions: [compte.creer] }\n",
    "/roles/0/permissions/0",
  ),
  schemaBad(
    "id de permission mal formé (PM- seul)",
    perm(PERM_OK).replace("PM-compte.creer", "PM-"),
    "/permissions/0/id",
  ),
  schemaBad(
    "id de permission avec majuscule",
    perm(PERM_OK).replace("PM-compte", "PM-Compte"),
    "/permissions/0/id",
  ),
  schemaBad(
    "id de permission finissant par un point",
    perm(PERM_OK).replace("creer", "creer."),
    "/permissions/0/id",
  ),
  schemaBad(
    "id de permission sans préfixe",
    perm(PERM_OK).replace("PM-compte.creer", "compte.creer"),
    "/permissions/0/id",
  ),
  schemaBad(
    "action hors enum",
    perm("    action: voir\n    ressource: T-user\n"),
    "/permissions/0/action",
  ),
  schemaBad("action absente", perm("    ressource: T-user\n"), "/permissions/0/action"),
  schemaBad("ressource absente", perm("    action: lire\n"), "/permissions/0/ressource"),
  schemaBad(
    "ressource ni table ni endpoint",
    perm("    action: lire\n    ressource: S-register\n"),
    "/permissions/0/ressource",
  ),
  schemaBad(
    "ressource table mal formée",
    perm("    action: lire\n    ressource: T-User\n"),
    "/permissions/0/ressource",
  ),
  schemaBad(
    "condition non textuelle",
    perm(`${PERM_OK}    conditions: [1]\n`),
    "/permissions/0/conditions/0",
  ),
  schemaBad(
    "endpoint de permission mal formé",
    perm(`${PERM_OK}    endpoints: [auth]\n`),
    "/permissions/0/endpoints/0",
  ),
  schemaBad("clé inconnue sur une permission", perm(`${PERM_OK}    portee: x\n`), "/permissions/0"),
  schemaBad("roles n'est pas une liste", "roles: {}\n", "/roles"),
  schemaBad("racine non objet", "- a\n", ""),
  {
    name: "id de rôle dupliqué",
    content: "roles:\n  - { id: RL-x, nom: X }\n  - { id: RL-x, nom: Y }\n",
    code: "STRUCT_DUPLICATE_ID",
    pointer: "/roles/1/id",
  },
  {
    name: "id de permission dupliqué",
    content: `roles: []\npermissions:\n  - { id: PM-a, action: lire, ressource: T-user }\n  - { id: PM-a, action: creer, ressource: T-user }\n`,
    code: "STRUCT_DUPLICATE_ID",
    pointer: "/permissions/1/id",
  },
];

describe("parseur de domain/roles.yaml : fichiers invalides", () => {
  it.each(BAD)("$name : $code en $pointer, fichier exclu", ({ content, code, pointer }) => {
    const { spec, issues } = parseRoles(content);
    expect(issues.filter((i) => i.code === code && i.pointer === pointer)).toHaveLength(1);
    const hit = issues.find((i) => i.pointer === pointer);
    expect(hit).toMatchObject({ rule: "structure", severity: "error", path: ROLES });
    expect(spec.roles).toEqual([]);
  });

  it("le doublon désigne l'identifiant en entityId", () => {
    const issue = parseRoles(BAD[BAD.length - 2]?.content ?? "").issues[0];
    expect(issue?.entityId).toBe("RL-x");
  });

  it("alias et ancre YAML : STRUCT_YAML_FORBIDDEN_FEATURE", () => {
    const content = "roles: &r []\npermissions: *r\n";
    const { spec, issues } = parseRoles(content);
    expect(codes(issues)).toContain("STRUCT_YAML_FORBIDDEN_FEATURE");
    expect(spec.roles).toEqual([]);
  });

  it("clé dupliquée : STRUCT_DUPLICATE_KEY", () => {
    expect(codes(parseRoles("roles: []\nroles: []\n").issues)).toEqual(["STRUCT_DUPLICATE_KEY"]);
  });

  it("documents multiples : STRUCT_MULTIPLE_DOCUMENTS", () => {
    expect(codes(parseRoles("roles: []\n---\nroles: []\n").issues)).toEqual([
      "STRUCT_MULTIPLE_DOCUMENTS",
    ]);
  });

  it("syntaxe invalide : STRUCT_YAML_SYNTAX", () => {
    expect(codes(parseRoles("roles: [\n").issues)).toEqual(["STRUCT_YAML_SYNTAX"]);
  });

  it("fichier au-dessus de 1 Mio : STRUCT_FILE_TOO_LARGE", () => {
    const huge = `roles: []\n# ${"a".repeat(1_048_576)}\n`;
    expect(codes(parseRoles(huge).issues)).toEqual(["STRUCT_FILE_TOO_LARGE"]);
  });

  it("ne lève jamais sur du contenu absurde", () => {
    for (const junk of ["", "\u0000", "---\n---\n", "{", "- - -", "﻿", "a: &a [*a]", "null\n"])
      expect(() => parseRoles(junk)).not.toThrow();
  });

  it("un rôle invalide n'empêche pas les autres fichiers d'être parsés", () => {
    const files = withFiles({ [ROLES]: "roles: [\n" });
    const { spec, issues } = parseSpecFiles(files);
    expect(codes(issues)).toEqual(["STRUCT_YAML_SYNTAX"]);
    expect(spec.features.length).toBeGreaterThan(0);
    expect(checkSpec(files).ok).toBe(false);
  });
});
