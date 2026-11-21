import { describe, expect, it } from "vitest";
import { titleOf, validContent } from "./proposal-content.ts";

/** TK-111 : titre affiché et contenu validé des propositions de l'Architecture. */
describe("titre d'une proposition d'architecture", () => {
  it("composant : son nom ; flux : le parcours qu'il détaille ; décision et section : leur titre", () => {
    expect(titleOf("component", { name: "API" }, "?")).toBe("API");
    expect(titleOf("archflow", { flow: "P-reserver" }, "?")).toBe("P-reserver");
    expect(titleOf("adr", { title: "PostgreSQL" }, "?")).toBe("PostgreSQL");
    expect(titleOf("doc_section", { title: "Contexte" }, "?")).toBe("Contexte");
    expect(titleOf("component", {}, "repli")).toBe("repli");
  });
});

describe("contenu validé d'une proposition d'architecture", () => {
  const component = {
    name: "API",
    type: "service",
    zone: "Noyau",
    responsibility: "Expose les procédures.",
  };

  it("le schéma de son type : valide rend titre et charge, invalide est refusé sans citer le texte", () => {
    expect(validContent("component", component, "content", "x")).toMatchObject({ title: "API" });
    expect(() =>
      validContent("component", { ...component, type: "lambda" }, "content", "x"),
    ).toThrow();
    expect(
      validContent("doc_section", { title: "Contexte", markdown: "Texte." }, "content", "x"),
    ).toEqual({
      title: "Contexte",
      payload: { title: "Contexte", markdown: "Texte." },
    });
  });
});
