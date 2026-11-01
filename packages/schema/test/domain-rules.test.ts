import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { kindOf, parseRuleMarkdown, parseSpecFiles } from "../src/index.ts";
import { codes, deepFreeze, validFile, withFiles } from "./helpers.ts";

/**
 * TK-53b : parseur de `domain/rules/R-nnn-slug.md` (front matter + `## Énoncé` + `## Exemples`).
 * Décisions : .workflow/TK-53/03-decisions-53b.md §3.
 */
const RULE = "domain/rules/R-003-email-unique.md";
const rule = (front: string, body = "## Énoncé\nUn énoncé.\n") => `---\n${front}---\n\n${body}`;
const FRONT = "id: R-003\ntype: contrainte\n";
const parseAt = (path: string, content: string) => parseSpecFiles([{ path, content }]);
const parse = (content: string, path = RULE) => parseRuleMarkdown(path, content);

const issuesOf = (r: ReturnType<typeof parse>) => (r.ok ? [] : r.issues);

describe("kindOf : domain/rules", () => {
  it("reconnaît R-*.md directement sous domain/rules", () => {
    expect(kindOf(RULE)).toBe("rule");
    expect(kindOf("domain/rules/R-1000-x.md")).toBe("rule");
    for (const other of [
      "domain/rules/.gitkeep",
      "domain/rules/notes.md",
      "domain/rules/sub/R-1-x.md",
      "domain/rules/R-003.yaml",
      "domain/R-003-x.md",
    ])
      expect(kindOf(other), other).toBeUndefined();
  });
});

describe("parseRuleMarkdown : cas valides", () => {
  it("fixture valide : tous les champs", () => {
    const r = parse(validFile(RULE));
    expect(r).toEqual({
      ok: true,
      value: {
        id: "R-003",
        type: "contrainte",
        tables: ["T-user"],
        endpoints: ["E-auth-register"],
        enonce:
          "L'email d'un compte est unique : deux comptes ne partagent jamais la même adresse.",
        exemples: [
          "`claire@example.org` est déjà inscrit : un second compte avec cet email est refusé.",
          "`Claire@Example.org` et `claire@example.org` désignent la même adresse.",
        ],
      },
    });
  });

  it("snapshot : la règle atterrit dans spec.rules, sans issue", () => {
    const { spec, issues } = parseSpecFiles(withFiles({}));
    expect(issues).toEqual([]);
    expect(spec.rules.map((r) => r.path)).toEqual([RULE]);
    expect(spec.rules[0]?.value.id).toBe("R-003");
  });

  it.each(["contrainte", "calcul", "workflow"])("type %s", (type) => {
    expect(parse(rule(`id: R-003\ntype: ${type}\n`)).ok).toBe(true);
  });

  it("sans tables, endpoints ni exemples : défauts []", () => {
    expect(parse(rule(FRONT))).toEqual({
      ok: true,
      value: {
        id: "R-003",
        type: "contrainte",
        tables: [],
        endpoints: [],
        enonce: "Un énoncé.",
        exemples: [],
      },
    });
  });

  it("section Exemples présente mais vide : []", () => {
    const r = parse(rule(FRONT, "## Énoncé\nX.\n\n## Exemples\n"));
    expect(r.ok && r.value.exemples).toEqual([]);
  });

  it("énoncé sur plusieurs lignes : joint par \\n, rogné ; autres sections ignorées ; puces * acceptées", () => {
    const body =
      "## Énoncé\n\nLigne un.\n\nLigne deux.\n\n## Divers\nignoré\n\n## Exemples\n* a\n- b\n";
    const r = parse(rule(FRONT, body));
    expect(r.ok && r.value.enonce).toBe("Ligne un.\n\nLigne deux.");
    expect(r.ok && r.value.exemples).toEqual(["a", "b"]);
  });

  it("l'ordre des sections n'importe pas", () => {
    const r = parse(rule(FRONT, "## Exemples\n- a\n\n## Énoncé\nX.\n"));
    expect(r.ok && r.value.enonce).toBe("X.");
  });

  it("titre `Enonce` sans accent accepté", () => {
    expect(parse(rule(FRONT, "## Enonce\nX.\n")).ok).toBe(true);
  });

  it.each([
    ["R-003-email-unique.md", "R-003"],
    ["R-003.md", "R-003"],
    ["R-1000-quatre-chiffres.md", "R-1000"],
  ])("nom de fichier %s pour l'id %s", (name, id) => {
    const { spec, issues } = parseAt(`domain/rules/${name}`, rule(`id: ${id}\ntype: calcul\n`));
    expect(issues).toEqual([]);
    expect(spec.rules[0]?.value.id).toBe(id);
  });

  it("CRLF, BOM et accents donnent la même valeur que LF", () => {
    const lf = validFile(RULE);
    const ref = parse(lf);
    expect(parse(lf.replaceAll("\n", "\r\n"))).toEqual(ref);
    expect(parse(`﻿${lf}`)).toEqual(ref);
    expect(ref.ok && ref.value.enonce).toContain("même");
  });

  it("déterministe et sans mutation d'entrée gelée", () => {
    const files = deepFreeze(withFiles({}));
    expect(parseSpecFiles(files)).toEqual(parseSpecFiles(files));
  });
});

type Bad = { name: string; content: string; code: string; pointer: string; path?: string };
const bad = (name: string, content: string, code: string, pointer: string, path?: string): Bad =>
  path === undefined ? { name, content, code, pointer } : { name, content, code, pointer, path };
const SCHEMA = "STRUCT_SCHEMA_VIOLATION";

const BAD: Bad[] = [
  bad("type hors enum", rule("id: R-003\ntype: invariant\n"), SCHEMA, "/type"),
  bad("type absent", rule("id: R-003\n"), SCHEMA, "/type"),
  bad("id absent", rule("type: calcul\n"), SCHEMA, "/id"),
  bad(
    "id à 2 chiffres (R-03)",
    rule("id: R-03\ntype: calcul\n"),
    SCHEMA,
    "/id",
    "domain/rules/R-03-x.md",
  ),
  bad(
    "id non numérique",
    rule("id: R-abc\ntype: calcul\n"),
    SCHEMA,
    "/id",
    "domain/rules/R-abc-x.md",
  ),
  bad("énoncé vide", rule(FRONT, "## Énoncé\n\n## Exemples\n- a\n"), SCHEMA, "/enonce"),
  bad("énoncé absent", rule(FRONT, "## Exemples\n- a\n"), "STRUCT_MARKDOWN_SYNTAX", "/enonce"),
  bad("corps sans aucune section", rule(FRONT, "du texte\n"), "STRUCT_MARKDOWN_SYNTAX", "/enonce"),
  bad(
    "ligne d'exemple sans puce",
    rule(FRONT, "## Énoncé\nX.\n\n## Exemples\nsans puce\n"),
    "STRUCT_MARKDOWN_SYNTAX",
    "/exemples",
  ),
  bad("clé inconnue (tests)", rule(`${FRONT}tests: []\n`), SCHEMA, ""),
  bad("table mal formée", rule(`${FRONT}tables: [user]\n`), SCHEMA, "/tables/0"),
  bad("endpoint mal formé", rule(`${FRONT}endpoints: [E-ok, auth]\n`), SCHEMA, "/endpoints/1"),
  bad("tables n'est pas une liste", rule(`${FRONT}tables: T-user\n`), SCHEMA, "/tables"),
  bad("front matter absent", "## Énoncé\nX.\n", "STRUCT_FRONT_MATTER_MISSING", ""),
  bad(
    "front matter non terminé",
    `---\n${FRONT}## Énoncé\nX.\n`,
    "STRUCT_FRONT_MATTER_MISSING",
    "",
  ),
  bad("fichier vide", "", "STRUCT_FRONT_MATTER_MISSING", ""),
  bad(
    "nom de fichier ≠ id",
    rule(FRONT),
    "STRUCT_ID_MISMATCH",
    "/id",
    "domain/rules/R-004-autre.md",
  ),
  bad(
    "alias YAML dans le front matter",
    rule("id: R-003\ntype: &t contrainte\nx: *t\n"),
    "STRUCT_YAML_FORBIDDEN_FEATURE",
    "",
  ),
  bad(
    "clé dupliquée dans le front matter",
    rule(`${FRONT}type: calcul\n`),
    "STRUCT_DUPLICATE_KEY",
    "",
  ),
  bad("syntaxe YAML invalide", rule("id: [\n"), "STRUCT_YAML_SYNTAX", ""),
  bad(
    "fichier trop gros",
    rule(FRONT, `## Énoncé\n${"a".repeat(1_048_576)}\n`),
    "STRUCT_FILE_TOO_LARGE",
    "",
  ),
];

describe("parseRuleMarkdown : fichiers invalides", () => {
  it.each(BAD)("$name : $code en '$pointer', règle exclue", ({ content, code, pointer, path }) => {
    const target = path ?? RULE;
    const { spec, issues } = parseAt(target, content);
    expect(issues.filter((i) => i.code === code && i.pointer === pointer)).toHaveLength(1);
    expect(issues.every((i) => i.rule === "structure" && i.severity === "error")).toBe(true);
    expect(issues.every((i) => i.path === target)).toBe(true);
    expect(spec.rules).toEqual([]);
  });

  it("l'API directe renvoie les mêmes issues, sans lever", () => {
    expect(codes(issuesOf(parse(BAD[0]?.content ?? "")))).toEqual([SCHEMA]);
    expect(codes(issuesOf(parse("")))).toEqual(["STRUCT_FRONT_MATTER_MISSING"]);
  });

  it("l'issue de schéma porte l'id brut en entityId", () => {
    const [issue] = issuesOf(parse(rule("id: R-003\ntype: invariant\n")));
    expect(issue?.entityId).toBe("R-003");
  });

  it("deux fichiers pour R-003 : STRUCT_DUPLICATE_ID sur le second chemin, pointeur /id", () => {
    const second = "domain/rules/R-003-zzz.md";
    const { spec, issues } = parseSpecFiles(withFiles({ [second]: validFile(RULE) }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "STRUCT_DUPLICATE_ID",
      path: second,
      pointer: "/id",
      entityId: "R-003",
    });
    expect(spec.rules.map((r) => r.path)).toEqual([RULE]);
  });

  it("ne lève jamais sur du contenu absurde", () => {
    for (const junk of [
      "",
      "\u0000",
      "---\n---\n",
      "{",
      "﻿",
      "---\nid: R-003\n---",
      "---\n- a\n---\n",
    ])
      expect(() => parse(junk)).not.toThrow();
  });
});

describe("réutilisation de splitFrontMatter", () => {
  const source = readFileSync(
    resolve(import.meta.dirname, "../src/parse/rule-markdown.ts"),
    "utf8",
  );

  it("rule-markdown.ts l'importe depuis ./frontmatter.ts et ne le redéfinit pas", () => {
    expect(source).toMatch(
      /import\s*\{[^}]*splitFrontMatter[^}]*\}\s*from\s*"\.\/frontmatter\.ts"/,
    );
    expect(source).not.toMatch(/function\s+splitFrontMatter/);
  });
});
