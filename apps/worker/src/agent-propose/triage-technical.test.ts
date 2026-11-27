import { describe, expect, it } from "vitest";
import { type TriageContext, titleKey, triageProposals } from "./triage.ts";
import type { TechnicalRefs } from "./triage-technical.ts";

/**
 * TK-115 lot B (B724, B727, B734, B735) : tri des propositions du cahier technique. Références inconnues écartées ou
 * retirées, valeur de secret toujours écartée, `specId` posé par le code seul selon le mode, estimations préfixées « ≈ ».
 */
const refs = (over: Partial<TechnicalRefs> = {}): TechnicalRefs => ({
  mode: "complete",
  components: new Set(["C-api", "C-sms"]),
  features: new Set(["F-001"]),
  rules: new Set(["R-001"]),
  decisions: new Set(["ADR-001"]),
  requirements: new Map([[titleKey("Rapidité"), "NFR-001"]]),
  knownRequirements: new Set(["NFR-001"]),
  stacks: new Map([
    ["ST-sms", { role: "Fournisseur SMS", open: true }],
    ["ST-base", { role: "Base de données", open: false }],
  ]),
  operations: new Set(["reservation.create"]),
  environments: new Set(["ENV-recette"]),
  docSections: new Map([
    ["DOC-objet", false],
    ["DOC-tests", true],
  ]),
  ...over,
});
const context = (mode = "complete"): TriageContext => ({
  kinds: ["stack", "op", "nfr", "env", "doc_section"],
  titles: {},
  missingCriteria: new Map(),
  tech: refs({ mode }),
});
const entry = (kind: string, content: object) => ({ kind, rationale: "Manquant", content });
const stack = (role: string, over: object = {}) =>
  entry("stack", {
    role,
    components: ["C-sms"],
    status: "open",
    options: ["A", "B"],
    criteria: [
      { label: "Prix", values: ["0,045 €", "≈ 0,07 €"] },
      { label: "Délai", values: ["300 ms", "Rapide"] },
      { label: "Données en UE", values: ["Oui", "Non"] },
    ],
    why: "Comparer.",
    requirements: ["NFR-001", "NFR-999"],
    decisions: ["ADR-001"],
    ...over,
  });
const op = (name: string, over: object = {}) =>
  entry("op", {
    name,
    type: "write",
    zone: "Réservation",
    component: "C-api",
    summary: "Fait.",
    permission: "public",
    input: [],
    output: [],
    errors: [{ code: "X", when: "y", rule: "R-999" }],
    rules: ["R-001"],
    features: ["F-001"],
    ...over,
  });
const nfr = (title: string, over: object = {}) =>
  entry("nfr", {
    category: "performance",
    title,
    target: "p95 < 300 ms",
    statement: "Vite.",
    verification: "ci_measure",
    links: ["C-api", "ST-futur"],
    ...over,
  });
const env = (name: string) =>
  entry("env", {
    name,
    address: "a.exemple.fr",
    hosting: "Paris",
    database: "PostgreSQL",
    data: "sample",
  });
const section = (title: string) => entry("doc_section", { title, markdown: "Texte." });
const run = (proposals: unknown[], mode = "complete") =>
  triageProposals({ proposals }, context(mode));
const payloads = (result: ReturnType<typeof run>) => result.accepted.map((c) => c.payload);

describe("références", () => {
  it("choix : exigence inconnue retirée ; composant ou décision inconnus : écarté", () => {
    const result = run([
      stack("Cache"),
      stack("Autre", { components: ["C-absent"] }),
      stack("Encore", { decisions: ["ADR-999"] }),
    ]);
    expect(result.accepted.map((c) => c.title)).toEqual(["Cache"]);
    expect(result.accepted[0]?.zone).toBe("Stack");
    expect(result.discarded).toBe(2);
    expect(payloads(result)[0]?.requirements).toEqual(["NFR-001"]);
  });

  it("opération : composant, règle ou fonctionnalité inconnus écartés ; règle d'erreur inconnue retirée ; zone trop longue écartée", () => {
    const result = run([
      op("avis.create"),
      op("a.b", { component: "C-absent" }),
      op("c.d", { features: ["F-999"] }),
      op("e.f", { zone: "z".repeat(90) }),
    ]);
    expect(result.accepted.map((c) => [c.title, c.zone])).toEqual([["avis.create", "Réservation"]]);
    expect(payloads(result)[0]?.errors).toEqual([{ code: "X", when: "y" }]);
  });

  it("exigence : lien inconnu écarté, choix pas encore enregistré admis", () => {
    const result = run([nfr("Neuve"), nfr("Autre", { links: ["C-absent"] })]);
    expect(result.accepted.map((c) => c.title)).toEqual(["Neuve"]);
    expect(result.accepted[0]?.zone).toBe("Exigences");
  });

  it("estimations de prix et de performance préfixées « ≈ » et marquées (B734)", () => {
    const [payload] = payloads(run([stack("Cache")]));
    expect(payload?.criteria).toEqual([
      { label: "Prix", estimate: true, values: ["≈ 0,045 €", "≈ 0,07 €"] },
      { label: "Délai", estimate: true, values: ["≈ 300 ms", "Rapide"] },
      { label: "Données en UE", values: ["Oui", "Non"] },
    ]);
  });
});

describe("modes et specId posé par le code", () => {
  const all = () => [
    stack("Fournisseur SMS"),
    stack("Base de données", { status: "open" }),
    op("reservation.create"),
    nfr("Rapidité"),
    env("Recette"),
    section("Objet"),
    section("Tests"),
  ];
  const targets = (mode: string) =>
    run(all(), mode).accepted.map((c) => [c.kind, c.payload.specId]);

  it("compléter : seulement le manquant ; une section vide est proposée avec son identifiant", () => {
    const result = run(all(), "complete");
    expect(result.accepted.map((c) => [c.kind, c.payload.specId])).toEqual([
      ["doc_section", "DOC-tests"],
    ]);
    expect(result.existingSections).toBe(1);
  });

  it("comparer : les choix à trancher seuls", () => {
    expect(targets("compare")).toContainEqual(["stack", "ST-sms"]);
    expect(targets("compare").filter(([kind]) => kind === "stack")).toHaveLength(1);
    expect(run([stack("Cache")], "compare").accepted).toEqual([]);
  });

  it("exigences mesurables : les exigences existantes seulement", () => {
    expect(
      run([nfr("Rapidité"), nfr("Inventée")], "nfr").accepted.map((c) => c.payload.specId),
    ).toEqual(["NFR-001"]);
  });

  it("tout reproposer : tout, avec l'identifiant de l'existant", () => {
    expect(targets("all")).toEqual([
      ["stack", "ST-sms"],
      ["stack", "ST-base"],
      ["op", "reservation.create"],
      ["nfr", "NFR-001"],
      ["env", "ENV-recette"],
      ["doc_section", "DOC-objet"],
      ["doc_section", "DOC-tests"],
    ]);
  });

  it("un specId venu du modèle est écarté ; un doublon du lancement aussi", () => {
    const forged = run([stack("Cache", { specId: "ST-sms" })], "all");
    expect(forged.accepted).toEqual([]);
    expect(run([stack("Cache"), stack("cache ")]).accepted).toHaveLength(1);
  });
});

describe("secrets (B724)", () => {
  const secret = `ghp_${"x".repeat(36)}`;

  it.each([
    ["stack", stack("Cache", { why: secret })],
    ["op", op("a.b", { summary: secret })],
    ["env", env(secret)],
  ])("%s : candidat écarté et compté", (_kind, candidate) => {
    expect(run([candidate])).toMatchObject({ accepted: [], discarded: 1 });
  });

  it("dans la justification, et pour les autres livrables", () => {
    expect(run([{ ...stack("Cache"), rationale: secret }]).accepted).toEqual([]);
    const functional = triageProposals(
      {
        proposals: [
          entry("feature", { title: "T", priority: "must", description: secret, criteria: [] }),
        ],
      },
      { kinds: ["feature"], titles: {}, missingCriteria: new Map() },
    );
    expect(functional).toMatchObject({ accepted: [], discarded: 1 });
  });
});
