import { describe, expect, it } from "vitest";
import { EmitAdrError, emitAdrMarkdown, parseAdrMarkdown } from "../src/index.ts";
import { ADR_MD } from "./architecture-helpers.ts";

/** TK-111 lot A : décision d'architecture Markdown (modèle `rule-markdown`). */
const PATH = "architecture/adr/ADR-001-base.md";

const parsed = () => {
  const result = parseAdrMarkdown(PATH, ADR_MD);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
};

describe("parseAdrMarkdown", () => {
  it("lit le front matter et les cinq sections", () => {
    const adr = parsed();
    expect(adr).toMatchObject({
      id: "ADR-001",
      titre: "Base relationnelle",
      statut: "acceptee",
      date: "2026-11-21",
      decideurs: ["Brice", "Léa Martin"],
      liens: ["F-001", "T-user"],
      contexte: "Les données sont très liées entre elles.",
      decision: "Une base relationnelle unique.",
      consequences: {
        positives: ["Transactions simples", "Requêtes de jointure natives"],
        a_accepter: ["Montée en charge verticale d'abord"],
      },
      en_clair: "Nous gardons une seule base pour que tout reste cohérent.",
    });
    expect(adr.alternatives).toEqual([
      { nom: "Base documentaire", raison: "les liens entre tables sont trop nombreux." },
      { nom: "Fichiers plats", raison: "aucune garantie d'intégrité." },
    ]);
  });

  it("En clair est facultatif", () => {
    const sans = ADR_MD.split("## En clair")[0] as string;
    const result = parseAdrMarkdown(PATH, sans);
    expect(result.ok && result.value.en_clair).toBeFalsy();
    expect(result.ok).toBe(true);
  });

  it("front matter absent, section manquante, ligne d'alternative sans gras : issues structurées", () => {
    const noFront = parseAdrMarkdown(PATH, "## Contexte\nx\n");
    expect(noFront.ok ? [] : noFront.issues.map((i) => i.code)).toEqual([
      "STRUCT_FRONT_MATTER_MISSING",
    ]);
    const noDecision = parseAdrMarkdown(
      PATH,
      ADR_MD.replace("## Décision\nUne base relationnelle unique.\n", ""),
    );
    expect(noDecision.ok ? [] : noDecision.issues.map((i) => i.code)).toEqual([
      "STRUCT_MARKDOWN_SYNTAX",
    ]);
    const badAlt = parseAdrMarkdown(
      PATH,
      ADR_MD.replace("- **Fichiers plats** : aucune garantie d'intégrité.", "- Fichiers plats"),
    );
    expect(badAlt.ok ? [] : badAlt.issues.map((i) => i.code)).toEqual(["STRUCT_MARKDOWN_SYNTAX"]);
  });

  it("statut inconnu : violation du schéma au pointeur /statut", () => {
    const result = parseAdrMarkdown(PATH, ADR_MD.replace("statut: acceptee", "statut: refusee"));
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.issues[0]?.pointer).toBe("/statut");
  });
});

describe("emitAdrMarkdown", () => {
  it("aller-retour exact et idempotent", () => {
    const text = emitAdrMarkdown(parsed());
    expect(text).toBe(ADR_MD);
    const again = parseAdrMarkdown(PATH, text);
    expect(again.ok && emitAdrMarkdown(again.value)).toBe(text);
    expect(again.ok && again.value).toEqual(parsed());
  });

  it("refuse une ligne structurelle dans un corps, un saut de ligne dans le titre, un ADR invalide", () => {
    const base = parsed();
    expect(() => emitAdrMarkdown({ ...base, contexte: "ok\n## Décision\nfaux" })).toThrow(
      EmitAdrError,
    );
    expect(() => emitAdrMarkdown({ ...base, decision: "a\n---\nb" })).toThrow(EmitAdrError);
    expect(() => emitAdrMarkdown({ ...base, titre: "a\nb" })).toThrow(EmitAdrError);
    expect(() => emitAdrMarkdown({ ...base, id: "X" as never })).toThrow(EmitAdrError);
  });

  it("une alternative dont le nom contient ** ne casse pas la relecture", () => {
    const base = parsed();
    const hostile = { ...base, alternatives: [{ nom: "a ** b", raison: "x" }] };
    expect(() => emitAdrMarkdown(hostile)).toThrow(EmitAdrError);
  });
});
