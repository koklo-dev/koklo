import { describe, expect, it } from "vitest";
import { errorCodeOf } from "./errors.ts";
import { type TriageContext, triageProposals, zonesOf } from "./triage.ts";

/** TK-99a lot B : tri pur de la sortie d'une zone (validation Zod, texte brut, doublons) et des zones. */
const criteria = [
  {
    title: "Cas",
    steps: [
      { type: "etant_donne", text: "a" },
      { type: "quand", text: "b" },
      { type: "alors", text: "c" },
    ],
  },
];
const item = (title: string) => ({
  kind: "feature",
  rationale: "Pourquoi",
  content: { title, priority: "must", description: "", criteria },
});
const context = (over: Partial<TriageContext> = {}): TriageContext => ({
  kinds: ["feature"],
  titles: new Set(),
  missingCriteria: new Map(),
  ...over,
});

describe("triageProposals", () => {
  it("accepte une proposition valide et lui donne son titre", () => {
    const { accepted, discarded } = triageProposals({ proposals: [item("Export")] }, context());
    expect(discarded).toBe(0);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ kind: "feature", title: "Export", rationale: "Pourquoi" });
  });

  it("écarte et compte : texte brut, schéma, type non attendu, doublon, forme", () => {
    const raw = {
      proposals: [
        item("Valide"),
        item("Avec <i>balise</i>"),
        { ...item("Extra"), content: { ...item("Extra").content, statut: "x" } },
        { kind: "role", rationale: "x", content: { name: "N", description: "" } },
        item("valide"),
        null,
        { kind: "feature", rationale: "Voir https://exemple.test", content: item("Autre").content },
      ],
    };
    const { accepted, discarded } = triageProposals(raw, context());
    expect(accepted.map((a) => a.title)).toEqual(["Valide"]);
    expect(discarded).toBe(6);
  });

  it("plafonne une zone à 25 propositions : l'excédent est écarté et compté", () => {
    const proposals = Array.from({ length: 30 }, (_, index) => item(`Fonction ${index}`));
    const { accepted, discarded } = triageProposals({ proposals }, context());
    expect(accepted).toHaveLength(25);
    expect(discarded).toBe(5);
  });

  it("critères : la fonctionnalité doit être connue et sans critère", () => {
    const missing = new Map([["F-002", "Export"]]);
    const make = (specId: string) => ({
      kind: "criteria",
      rationale: "Manque",
      content: { specId, criteria },
    });
    const { accepted, discarded } = triageProposals(
      { proposals: [make("F-002"), make("F-002"), make("F-001")] },
      context({ kinds: ["criteria"], missingCriteria: missing }),
    );
    expect(accepted.map((a) => a.title)).toEqual(["F-002 · Export"]);
    expect(discarded).toBe(2);
  });

  it("une sortie qui n'est pas { proposals: [...] } lève une erreur de sortie", () => {
    expect(() => triageProposals({ proposals: "x" }, context())).toThrow();
    expect(() => triageProposals(null, context())).toThrow();
  });
});

describe("zonesOf", () => {
  it("garde au plus douze titres bruts, sans doublon, sans contenu interdit", () => {
    const zones = Array.from({ length: 14 }, (_, index) => `Zone ${index}`);
    expect(zonesOf({ zones: [...zones, "Zone 0", "<b>x</b>", ""] })).toEqual(zones.slice(0, 12));
  });

  it("refuse une sortie sans liste de zones exploitable", () => {
    expect(() => zonesOf({ zones: "x" })).toThrow();
    expect(() => zonesOf({ zones: ["<b>x</b>", ""] })).toThrow();
  });
});

describe("errorCodeOf", () => {
  it("ne rend qu'un code, jamais le texte de l'erreur", () => {
    expect(errorCodeOf(new Error("SECRET"))).toBe("provider_error");
    expect(errorCodeOf(new TypeError("SECRET"))).toBe("provider_error");
  });
});
