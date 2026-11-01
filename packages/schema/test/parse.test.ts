import { describe, expect, it } from "vitest";
import { ISSUE_CODES, parseSpecFiles } from "../src/index.ts";
import { codes, deepFreeze, patch, validFile, validFiles, withFiles } from "./helpers.ts";

const TABLE = "data/tables/T-bad.yaml";
const parseOne = (path: string, content: string) => parseSpecFiles([{ path, content }]);

describe("CA8 parseSpecFiles : fixture valide", () => {
  it("transforme le texte en entités sans aucune issue", () => {
    const { spec, issues } = parseSpecFiles(validFiles());
    expect(issues).toEqual([]);
    expect(spec.project?.path).toBe("koklo.project.yaml");
    expect(spec.project?.value.projet).toBe("civinat");
    expect(spec.features.map((f) => f.path)).toEqual([
      "features/F-001-inscription.md",
      "features/F-004-criteres-structures.md",
    ]);
    expect(spec.features[0]?.value.criteres.map((c) => c.id)).toEqual(["AC-1", "AC-2", "AC-3"]);
    expect(spec.tables.map((t) => t.value.id)).toEqual(["T-session", "T-user"]);
    expect(spec.relations[0]?.value.relations[0]?.from).toBe("T-session.user_id");
    expect(spec.endpoints.map((e) => e.value.id)).toEqual(["E-auth-register"]);
    expect(spec.screens.map((s) => s.value.id)).toEqual(["S-register", "S-register-success"]);
    expect(spec.tests[0]?.value.criteres).toEqual(["AC-1", "AC-2", "AC-3"]);
  });

  it("ignore les fichiers hors modèle (brief, architecture) sans issue", () => {
    const files = withFiles({
      "brief/0001-idee-initiale.md": "# Idée\n",
      "architecture/overview.md": "x: [",
    });
    expect(parseSpecFiles(files).issues).toEqual([]);
  });

  it("ne lève jamais, même sur du contenu absurde", () => {
    const junk = ["", "\u0000\u0001", "---\n---\n", "{", "- - -", "﻿", "a: &a [*a]"];
    for (const path of [
      "koklo.project.yaml",
      TABLE,
      "features/F-009-x.md",
      "design/screens/S-x.json",
    ]) {
      for (const content of junk) expect(() => parseOne(path, content)).not.toThrow();
    }
  });

  it("ne mute pas l'entrée gelée et reste déterministe", () => {
    const frozen = deepFreeze(validFiles());
    const a = parseSpecFiles(frozen);
    const b = parseSpecFiles(frozen);
    expect(b).toEqual(a);
  });
});

describe("CA8 YAML durci", () => {
  it("syntaxe invalide : STRUCT_YAML_SYNTAX avec ligne et colonne", () => {
    const { issues, spec } = parseOne(TABLE, "id: T-bad\nchamps: [\n  - nom: x\n");
    expect(codes(issues)).toEqual(["STRUCT_YAML_SYNTAX"]);
    expect(issues[0]).toMatchObject({
      rule: "structure",
      severity: "error",
      path: TABLE,
      pointer: "",
    });
    expect(issues[0]?.message).toMatch(/ligne \d+/);
    expect(issues[0]?.message).toMatch(/colonne \d+/);
    expect(spec.tables).toEqual([]);
  });

  it("clé dupliquée : STRUCT_DUPLICATE_KEY (jamais la dernière gagne)", () => {
    const { issues, spec } = parseOne(TABLE, "id: T-bad\nid: T-bad2\nchamps: []\n");
    expect(codes(issues)).toEqual(["STRUCT_DUPLICATE_KEY"]);
    expect(issues[0]?.message).toContain("id");
    expect(spec.tables).toEqual([]);
  });

  it("clé dupliquée dans un objet imbriqué", () => {
    const content =
      "id: T-bad\nchamps:\n  - { nom: a, nom: b, type: text, nullable: false, unique: false }\n";
    expect(codes(parseOne(TABLE, content).issues)).toEqual(["STRUCT_DUPLICATE_KEY"]);
  });

  it.each([
    ["ancre et alias", "id: T-bad\nchamps: &c []\nautres: *c\n"],
    ["ancre seule", "id: &i T-bad\nchamps: []\n"],
    ["alias de fusion <<", "base: &b { x: 1 }\nid: T-bad\nchamps: []\nm:\n  <<: *b\n"],
    ["étiquette personnalisée", "id: !custom T-bad\nchamps: []\n"],
  ])("%s : STRUCT_YAML_FORBIDDEN_FEATURE", (_n, content) => {
    const { issues, spec } = parseOne(TABLE, content);
    expect(codes(issues)).toContain("STRUCT_YAML_FORBIDDEN_FEATURE");
    expect(spec.tables).toEqual([]);
  });

  it("clé de fusion << sans alias : jamais fusionnée, refusée", () => {
    const { issues, spec } = parseOne(TABLE, "id: T-bad\nchamps: []\n<<: { description: x }\n");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.code.startsWith("STRUCT_"))).toBe(true);
    expect(spec.tables).toEqual([]);
  });

  it("documents multiples : STRUCT_MULTIPLE_DOCUMENTS", () => {
    const { issues } = parseOne(TABLE, "id: T-bad\nchamps: []\n---\nid: T-bad2\nchamps: []\n");
    expect(codes(issues)).toEqual(["STRUCT_MULTIPLE_DOCUMENTS"]);
  });

  it("fichier au-dessus de 1 Mio : STRUCT_FILE_TOO_LARGE, sans analyse", () => {
    const huge = `id: T-bad\nchamps: []\n# ${"a".repeat(1_048_576)}\n`;
    expect(codes(parseOne(TABLE, huge).issues)).toEqual(["STRUCT_FILE_TOO_LARGE"]);
  });

  it("fichier juste sous le plafond : accepté", () => {
    const content = `id: T-ok\nchamps: []\n# ${"a".repeat(1_048_576 - 40)}\n`;
    expect(parseOne("data/tables/T-ok.yaml", content).issues).toEqual([]);
  });

  it("schéma core YAML 1.2 : no/yes/on restent des chaînes, pas des booléens", () => {
    const content =
      "id: T-ok\nchamps:\n  - { nom: no, type: text, nullable: false, unique: false }\n";
    const { spec, issues } = parseOne("data/tables/T-ok.yaml", content);
    expect(issues).toEqual([]);
    expect(spec.tables[0]?.value.champs[0]?.nom).toBe("no");
    const yes = "id: T-ok\nchamps:\n  - { nom: x, type: text, nullable: yes, unique: false }\n";
    const res = parseOne("data/tables/T-ok.yaml", yes);
    expect(codes(res.issues)).toEqual(["STRUCT_SCHEMA_VIOLATION"]);
    expect(res.issues[0]?.pointer).toBe("/champs/0/nullable");
  });

  it("une date YAML non guillemetée n'est pas convertie en objet Date", () => {
    const content = "id: T-ok\ndescription: 2026-01-31\nchamps: []\n";
    const { spec } = parseOne("data/tables/T-ok.yaml", content);
    const description = (spec.tables[0]?.value as { description?: unknown } | undefined)
      ?.description;
    expect(description === undefined || typeof description === "string").toBe(true);
  });
});

describe("CA8 structure : autres fichiers", () => {
  it("JSON invalide : STRUCT_JSON_SYNTAX", () => {
    const { issues, spec } = parseOne("design/screens/S-x.json", '{"id": "S-x",');
    expect(codes(issues)).toEqual(["STRUCT_JSON_SYNTAX"]);
    expect(spec.screens).toEqual([]);
  });

  it("spec_version 2 : STRUCT_UNSUPPORTED_SPEC_VERSION, refus net", () => {
    const content = patch("koklo.project.yaml", "spec_version: 1", "spec_version: 2");
    const { issues, spec } = parseOne("koklo.project.yaml", content);
    expect(codes(issues)).toEqual(["STRUCT_UNSUPPORTED_SPEC_VERSION"]);
    expect(issues[0]).toMatchObject({ path: "koklo.project.yaml", pointer: "/spec_version" });
    expect(spec.project).toBeUndefined();
  });

  it("violation de schéma : une issue par erreur, pointeur JSON", () => {
    const content = patch("data/tables/T-user.yaml", "type: uuid", "type: varchar").replace(
      "nom: email,",
      "nom: 42,",
    );
    const { issues } = parseOne("data/tables/T-user.yaml", content);
    expect(codes(issues)).toEqual(["STRUCT_SCHEMA_VIOLATION", "STRUCT_SCHEMA_VIOLATION"]);
    expect(issues.map((i) => i.pointer).sort()).toEqual(["/champs/0/type", "/champs/1/nom"]);
    expect(issues.every((i) => i.entityId === "T-user")).toBe(true);
  });

  it("clé inconnue : STRUCT_SCHEMA_VIOLATION nommant la clé", () => {
    const content = `${validFile("data/tables/T-user.yaml")}inconnue: 1\n`;
    const { issues } = parseOne("data/tables/T-user.yaml", content);
    expect(codes(issues)).toEqual(["STRUCT_SCHEMA_VIOLATION"]);
    expect(issues[0]?.message).toContain("inconnue");
  });

  it("id différent du nom de fichier : STRUCT_ID_MISMATCH", () => {
    const { issues } = parseOne("data/tables/T-autre.yaml", validFile("data/tables/T-user.yaml"));
    expect(codes(issues)).toEqual(["STRUCT_ID_MISMATCH"]);
    expect(issues[0]).toMatchObject({ entityId: "T-user", path: "data/tables/T-autre.yaml" });
  });

  it("id de feature différent du préfixe du fichier : STRUCT_ID_MISMATCH", () => {
    const { issues } = parseOne(
      "features/F-002-inscription.md",
      validFile("features/F-001-inscription.md"),
    );
    expect(codes(issues)).toEqual(["STRUCT_ID_MISMATCH"]);
  });

  it("id dupliqué : le premier chemin gagne, le suivant est signalé et exclu", () => {
    const content = validFile("features/F-001-inscription.md");
    const { issues, spec } = parseSpecFiles([
      { path: "features/F-001-zeta.md", content },
      { path: "features/F-001-alpha.md", content },
    ]);
    expect(codes(issues)).toEqual(["STRUCT_DUPLICATE_ID"]);
    expect(issues[0]).toMatchObject({ path: "features/F-001-zeta.md", entityId: "F-001" });
    expect(spec.features.map((f) => f.path)).toEqual(["features/F-001-alpha.md"]);
  });

  it("les issues de structure sont triées (path, pointer, code, message) quel que soit l'ordre d'entrée", () => {
    const files = [
      { path: "data/tables/T-b.yaml", content: "id: [" },
      { path: "data/tables/T-a.yaml", content: "id: [" },
    ];
    const forward = parseSpecFiles(files).issues.map((i) => i.path);
    const backward = parseSpecFiles([...files].reverse()).issues.map((i) => i.path);
    expect(forward).toEqual(["data/tables/T-a.yaml", "data/tables/T-b.yaml"]);
    expect(backward).toEqual(forward);
  });
});

describe("ISSUE_CODES", () => {
  it("expose les codes du contrat, constantes égales à leur clé", () => {
    const expected = [
      "R4_UNKNOWN_FEATURE",
      "R4_UNKNOWN_CRITERION",
      "R4_UNKNOWN_TABLE",
      "R4_UNKNOWN_FIELD",
      "R4_UNKNOWN_ENDPOINT",
      "R4_UNKNOWN_SCREEN",
      "R4_MALFORMED_DATA_REF",
      "R5_SPECIFIED_WITHOUT_SCREEN_OR_ENDPOINT",
      "R5_IMPLEMENTED_CRITERION_WITHOUT_TEST",
      "R5_IMPLEMENTED_WITHOUT_CRITERIA",
      "R5_CRITERION_INCOMPLETE",
      "R7_ORPHAN_TABLE",
      "R7_ORPHAN_ENDPOINT",
      "R7_ORPHAN_SCREEN",
      "R7_ORPHAN_TEST",
      "STRUCT_YAML_SYNTAX",
      "STRUCT_DUPLICATE_KEY",
      "STRUCT_YAML_FORBIDDEN_FEATURE",
      "STRUCT_MULTIPLE_DOCUMENTS",
      "STRUCT_FILE_TOO_LARGE",
      "STRUCT_JSON_SYNTAX",
      "STRUCT_FRONT_MATTER_MISSING",
      "STRUCT_MARKDOWN_SYNTAX",
      "STRUCT_SCHEMA_VIOLATION",
      "STRUCT_UNSUPPORTED_SPEC_VERSION",
      "STRUCT_ID_MISMATCH",
      "STRUCT_DUPLICATE_ID",
    ];
    for (const code of expected) expect(ISSUE_CODES[code as keyof typeof ISSUE_CODES]).toBe(code);
    expect(Object.keys(ISSUE_CODES).sort()).toEqual([...expected].sort());
  });
});
