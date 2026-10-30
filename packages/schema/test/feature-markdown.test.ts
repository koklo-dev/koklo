import { describe, expect, it } from "vitest";
import { parseFeatureMarkdown } from "../src/index.ts";
import { validFile } from "./helpers.ts";

const PATH = "features/F-001-inscription.md";
const source = validFile(PATH);

describe("CA10 parseur de feature Markdown", () => {
  const result = parseFeatureMarkdown(PATH, source);

  it("lit le front matter et la description de l'exemple F-001", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: "F-001",
      titre: "Inscription par email",
      statut: "implementee",
      priorite: "must",
      tables: ["T-user"],
      endpoints: ["E-auth-register"],
      ecrans: ["S-register", "S-register-success"],
      roles: ["RL-visiteur"],
      regles: ["R-003"],
      nfr: ["NFR-001"],
      description: "L'utilisateur crée un compte avec email et mot de passe.",
    });
  });

  it("extrait 3 critères AC-1..AC-3 dans l'ordre du document", () => {
    if (!result.ok) throw new Error("parse en échec");
    expect(result.value.criteres.map((c) => [c.id, c.titre])).toEqual([
      ["AC-1", "Email déjà utilisé"],
      ["AC-2", "Longueur du mot de passe"],
      ["AC-3", "Email de confirmation"],
    ]);
  });

  it("extrait les étapes Étant donné / Quand / Alors / Et de AC-1, dans l'ordre", () => {
    if (!result.ok) throw new Error("parse en échec");
    expect(result.value.criteres[0]?.etapes).toEqual([
      { type: "etant_donne", texte: "un compte existant avec l'email `claire@example.org`" },
      { type: "quand", texte: "un visiteur s'inscrit avec `claire@example.org`" },
      { type: "alors", texte: "l'inscription est refusée" },
      {
        type: "et",
        texte: "le message « Cet email est déjà utilisé » s'affiche sous le champ email",
      },
    ]);
    expect(result.value.criteres[2]?.etapes.map((e) => e.type)).toEqual([
      "etant_donne",
      "quand",
      "alors",
    ]);
  });

  it("conserve l'ordre des critères même non numériques dans l'ordre (AC-2 avant AC-1)", () => {
    const swapped = source
      .replace("### AC-1 —", "### AC-9 —")
      .replace("### AC-2 —", "### AC-1 —")
      .replace("### AC-9 —", "### AC-2 —");
    const res = parseFeatureMarkdown(PATH, swapped);
    expect(res.ok && res.value.criteres.map((c) => c.id)).toEqual(["AC-2", "AC-1", "AC-3"]);
  });

  it("front matter absent : STRUCT_FRONT_MATTER_MISSING", () => {
    const res = parseFeatureMarkdown(PATH, "## Description\nx\n");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.map((i) => i.code)).toEqual(["STRUCT_FRONT_MATTER_MISSING"]);
    expect(res.issues[0]).toMatchObject({
      rule: "structure",
      severity: "error",
      path: PATH,
      pointer: "",
    });
  });

  it("front matter non terminé : STRUCT_FRONT_MATTER_MISSING", () => {
    const res = parseFeatureMarkdown(PATH, "---\nid: F-001\n## Description\nx\n");
    expect(res.ok).toBe(false);
  });

  it("critère sans identifiant AC-n : STRUCT_MARKDOWN_SYNTAX", () => {
    const res = parseFeatureMarkdown(
      PATH,
      source.replace("### AC-2 — Longueur du mot de passe", "### Longueur du mot de passe"),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.map((i) => i.code)).toEqual(["STRUCT_MARKDOWN_SYNTAX"]);
    expect(res.issues[0]?.message).toContain("Longueur du mot de passe");
  });

  it("numérotation AC dupliquée : STRUCT_MARKDOWN_SYNTAX nommant le doublon", () => {
    const res = parseFeatureMarkdown(PATH, source.replace("### AC-2 —", "### AC-1 —"));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.map((i) => i.code)).toEqual(["STRUCT_MARKDOWN_SYNTAX"]);
    expect(res.issues[0]?.message).toContain("AC-1");
  });

  it("puce d'étape inconnue : STRUCT_MARKDOWN_SYNTAX", () => {
    const res = parseFeatureMarkdown(
      PATH,
      source.replace("**Alors** l'inscription", "**Puis** l'inscription"),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.map((i) => i.code)).toEqual(["STRUCT_MARKDOWN_SYNTAX"]);
  });

  it("front matter hors schéma : issue STRUCT_SCHEMA_VIOLATION avec pointeur", () => {
    const res = parseFeatureMarkdown(PATH, source.replace("statut: implementee", "statut: fini"));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.map((i) => [i.code, i.pointer])).toEqual([
      ["STRUCT_SCHEMA_VIOLATION", "/statut"],
    ]);
  });

  it("ne lève jamais sur une entrée vide", () => {
    expect(() => parseFeatureMarkdown(PATH, "")).not.toThrow();
  });
});
