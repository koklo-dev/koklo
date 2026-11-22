import { describe, expect, it } from "vitest";
import type { Dependency } from "./coverage.ts";
import { type LinkContext, linksOf, linksPlan } from "./links.ts";

/**
 * TK-114c (B635) : liens proposés par la passe de couverture. Retenu : `from` ≠ `to`, deux composants connus, au moins une
 * extrémité isolée du paquet, `from` où le lien peut s'écrire, absent de `from`, 30 dépendances au plus, jamais un lien
 * synchrone qui ferme un cycle synchrone. Un lien refusé est ignoré.
 */
const context = (over: Partial<LinkContext> = {}): LinkContext => ({
  isolated: new Set(["C-seul", "C-autre"]),
  dependencies: new Map<string, readonly Dependency[]>([
    ["C-api", [{ to: "C-db", via: "SQL" }]],
    ["C-db", []],
    ["C-seul", []],
    ["C-autre", []],
  ]),
  writable: (id) => id !== "C-decide",
  ...over,
});

describe("linksOf", () => {
  it("lit from, to, via, async ; forme invalide, motif hors C-, texte non brut : ignorés ; absent : []", () => {
    expect(
      linksOf([
        { from: "C-seul", to: "C-api", via: "HTTP", async: false },
        { from: "C-seul", to: "C-db", via: "AMQP", async: true },
        { from: "seul", to: "C-api", via: "HTTP" },
        { from: "C-seul", to: "C-api", via: "voir https://x.fr" },
        { from: "C-seul", to: "C-api" },
        "C-seul",
      ]),
    ).toEqual([
      { from: "C-seul", to: "C-api", via: "HTTP" },
      { from: "C-seul", to: "C-db", via: "AMQP", async: true },
    ]);
    expect(linksOf(undefined)).toEqual([]);
  });
});

describe("linksPlan", () => {
  it("retient un lien vers ou depuis un composant isolé, entre composants connus", () => {
    const plan = linksPlan(
      [
        { from: "C-seul", to: "C-api", via: "HTTP" },
        { from: "C-api", to: "C-autre", via: "gRPC" },
      ],
      context(),
    );
    expect(Object.fromEntries(plan)).toEqual({
      "C-seul": [{ to: "C-api", via: "HTTP" }],
      "C-api": [{ to: "C-autre", via: "gRPC" }],
    });
  });

  it("ignore : from = to, inconnu, aucune extrémité isolée, déjà présent, from non inscriptible", () => {
    const plan = linksPlan(
      [
        { from: "C-seul", to: "C-seul", via: "x" },
        { from: "C-seul", to: "C-fantome", via: "x" },
        { from: "C-fantome", to: "C-seul", via: "x" },
        { from: "C-api", to: "C-db", via: "TCP" },
        { from: "C-db", to: "C-api", via: "x" },
        { from: "C-decide", to: "C-seul", via: "x" },
      ],
      context({
        dependencies: new Map([...context().dependencies, ["C-decide", [] as Dependency[]]]),
      }),
    );
    expect(plan.size).toBe(0);
  });

  it("un lien répété dans la réponse n'est retenu qu'une fois", () => {
    const plan = linksPlan(
      [
        { from: "C-seul", to: "C-api", via: "HTTP" },
        { from: "C-seul", to: "C-api", via: "gRPC" },
      ],
      context(),
    );
    expect(plan.get("C-seul")).toEqual([{ to: "C-api", via: "HTTP" }]);
  });

  it("synchrone qui fermerait un cycle (index ou lien déjà retenu) : refusé ; asynchrone : admis", () => {
    const plan = linksPlan(
      [
        { from: "C-db", to: "C-seul", via: "x" },
        { from: "C-seul", to: "C-api", via: "HTTP" },
        { from: "C-autre", to: "C-seul", via: "HTTP" },
        { from: "C-seul", to: "C-autre", via: "HTTP" },
        { from: "C-seul", to: "C-autre", via: "AMQP", async: true },
      ],
      context(),
    );
    expect(Object.fromEntries(plan)).toEqual({
      "C-db": [{ to: "C-seul", via: "x" }],
      "C-autre": [{ to: "C-seul", via: "HTTP" }],
      "C-seul": [{ to: "C-autre", via: "AMQP", async: true }],
    });
  });

  it("30 dépendances au plus par composant : la 31e est ignorée", () => {
    const many = Array.from({ length: 29 }, (_, i) => ({ to: `C-c${i}`, via: "HTTP" }));
    const plan = linksPlan(
      [
        { from: "C-seul", to: "C-api", via: "HTTP" },
        { from: "C-seul", to: "C-db", via: "SQL" },
      ],
      context({
        dependencies: new Map<string, readonly Dependency[]>([
          ...context().dependencies,
          ["C-seul", many],
        ]),
      }),
    );
    expect(plan.get("C-seul")).toEqual([{ to: "C-api", via: "HTTP" }]);
  });
});
