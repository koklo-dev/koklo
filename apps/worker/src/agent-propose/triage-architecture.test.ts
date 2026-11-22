import { describe, expect, it } from "vitest";
import { type TriageContext, titleKey, triageProposals } from "./triage.ts";

/**
 * TK-111 lot B (cas 1, B511) : tri des propositions `component`, `archflow`, `adr`, `doc_section`. Une charge invalide, une
 * référence inconnue (table, fonctionnalité, règle, composant, parcours, décision, rôle), un doublon de nom, d'identifiant ou
 * de flux, un texte non brut sont écartés et comptés ; un composant proposé devient connu pour la suite de la génération.
 */
const context = (over: Partial<TriageContext> = {}): TriageContext => ({
  kinds: ["component", "archflow", "adr", "doc_section"],
  titles: { component: new Set([titleKey("API")]) },
  missingCriteria: new Map(),
  arch: {
    features: new Set(["F-001"]),
    rules: new Set(["R-001"]),
    tables: new Set(["T-client"]),
    flows: new Set(["P-reserver", "P-annuler"]),
    roles: new Set(["RL-client"]),
    components: new Set(["C-api"]),
    decisions: new Set(["ADR-001"]),
    archflows: new Set(["P-annuler"]),
    ownedTables: new Set<string>(),
  },
  ...over,
});
const component = (name: string, over: Record<string, unknown> = {}) => ({
  kind: "component",
  rationale: "Absent de l'architecture",
  content: {
    name,
    type: "service",
    zone: "Noyau",
    responsibility: "Fait son travail.",
    owns: ["T-client"],
    serves: ["F-001"],
    dependsOn: [{ to: "C-api", via: "HTTP" }],
    decisions: ["ADR-001"],
    ...over,
  },
});
const flow = (id: string, over: Record<string, unknown> = {}) => ({
  kind: "archflow",
  rationale: "Parcours sans flux",
  content: {
    flow: id,
    participants: ["RL-client", "C-api"],
    messages: [
      { from: "RL-client", to: "C-api", text: "Réserve" },
      { block: "alt", label: "Refus", messages: [{ from: "C-api", to: "RL-client", text: "Non" }] },
    ],
    features: ["F-001"],
    rules: ["R-001"],
    ...over,
  },
});
const adr = (title: string, over: Record<string, unknown> = {}) => ({
  kind: "adr",
  rationale: "Choix structurant",
  content: {
    title,
    context: "Contexte.",
    decision: "Décision.",
    alternatives: [{ name: "Autre", reason: "Moins adapté" }],
    links: ["C-api", "T-client", "F-001", "R-001", "P-reserver"],
    ...over,
  },
});
const section = (title: string, markdown = "Texte.") => ({
  kind: "doc_section",
  rationale: "Section manquante",
  content: { title, markdown },
});
const run = (proposals: unknown[], ctx = context()) => triageProposals({ proposals }, ctx);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("triage des composants", () => {
  it("accepte un composant valide : titre = nom, il devient connu pour les flux et les dépendances suivants", () => {
    const { accepted, discarded } = run([
      component("Base"),
      flow("P-reserver", {
        participants: ["RL-client", "C-base"],
        messages: [{ from: "RL-client", to: "C-base", text: "Lit" }],
      }),
      component("Cache", { dependsOn: [{ to: "C-base", via: "TCP" }] }),
    ]);
    expect(discarded).toBe(0);
    expect(accepted.map((a) => [a.kind, a.title])).toEqual([
      ["component", "Base"],
      ["archflow", "P-reserver"],
      ["component", "Cache"],
    ]);
  });

  it("écarte et compte : doublon de nom, référence inconnue de chaque espèce, type hors liste, texte non brut", () => {
    const { accepted, discarded } = run([
      component("api"),
      component("Un", { owns: ["T-absente"] }),
      component("Deux", { serves: ["F-099"] }),
      component("Quatre", { decisions: ["ADR-042"] }),
      component("Cinq", { type: "lambda" }),
      component("Six", { responsibility: "Voir [x](http://exemple.fr)" }),
      component("Sept"),
    ]);
    expect(accepted.map((a) => a.title)).toEqual(["Sept"]);
    expect(discarded).toBe(6);
  });

  it("deux noms au même identifiant C-<slug> : le second est écarté", () => {
    const { accepted, discarded } = run([
      component("Base de données"),
      component("Base de Données "),
    ]);
    expect(accepted).toHaveLength(1);
    expect(discarded).toBe(1);
  });

  it("TK-114c (B638) : une cible inconnue est retirée de dependsOn, le composant est gardé", () => {
    const { accepted, discarded } = run([
      component("Trois", {
        dependsOn: [
          { to: "C-fantome", via: "HTTP" },
          { to: "C-api", via: "HTTP" },
          { to: "C-trois", via: "SQL" },
        ],
      }),
      component("Quatre", { dependsOn: [{ to: "C-zone-suivante", via: "AMQP", async: true }] }),
    ]);
    expect(discarded).toBe(0);
    expect(accepted.map((a) => a.payload.dependsOn)).toEqual([
      [
        { to: "C-api", via: "HTTP" },
        { to: "C-trois", via: "SQL" },
      ],
      [],
    ]);
  });

  it("une dépendance sur soi-même est permise (id de son propre nom)", () => {
    expect(
      run([component("Base", { dependsOn: [{ to: "C-base", via: "SQL" }] })]).accepted,
    ).toHaveLength(1);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même livrable, un test par comportement
describe("triage des flux, décisions et sections", () => {
  it("flux : parcours connu, sans flux existant ; participants et messages visent des participants connus", () => {
    const { accepted, discarded } = run([
      flow("P-reserver"),
      flow("P-annuler"),
      flow("P-inconnu"),
      flow("P-reserver", { participants: ["RL-client", "C-api"] }),
    ]);
    expect(accepted.map((a) => a.title)).toEqual(["P-reserver"]);
    expect(discarded).toBe(3);
  });

  it("flux : un message d'un participant non déclaré, un rôle ou un composant inconnus sont écartés", () => {
    const { accepted, discarded } = run([
      flow("P-reserver", { messages: [{ from: "RL-client", to: "C-autre", text: "x" }] }),
      flow("P-reserver", {
        participants: ["RL-client", "C-fantome"],
        messages: [{ from: "RL-client", to: "C-fantome", text: "x" }],
      }),
      flow("P-reserver", {
        participants: ["RL-inconnu", "C-api"],
        messages: [{ from: "RL-inconnu", to: "C-api", text: "x" }],
      }),
      flow("P-reserver", { decisions: ["ADR-042"] }),
      flow("P-reserver", { features: ["F-099"] }),
    ]);
    expect(accepted).toHaveLength(0);
    expect(discarded).toBe(5);
  });

  it("décision : titre unique, liens connus", () => {
    const { accepted, discarded } = run([
      adr("PostgreSQL"),
      adr("postgresql"),
      adr("Cache", { links: ["C-fantome"] }),
      adr("Table", { links: ["T-absente"] }),
      adr("Sans alternative", { alternatives: [] }),
    ]);
    expect(accepted.map((a) => a.title)).toEqual(["PostgreSQL"]);
    expect(discarded).toBe(4);
  });

  it("section : titre unique dans la génération, texte brut", () => {
    const { accepted, discarded } = run([
      section("Contexte"),
      section("contexte"),
      section("Flux", "<script>x</script>"),
      section("Déploiement"),
    ]);
    expect(accepted.map((a) => a.title)).toEqual(["Contexte", "Déploiement"]);
    expect(discarded).toBe(2);
  });

  it("types non demandés par le mode : écartés ; sans contexte d'architecture : tout est écarté", () => {
    expect(run([component("Base")], context({ kinds: ["adr"] })).discarded).toBe(1);
    const without = triageProposals(
      { proposals: [component("Base"), adr("X")] },
      { kinds: ["component", "adr"], titles: {}, missingCriteria: new Map() },
    );
    expect(without).toMatchObject({ accepted: [], discarded: 2 });
  });

  it("TK-114b (B615) : un specId fourni par le modèle écarte l'entrée", () => {
    const { accepted, discarded } = run([component("Base", { specId: "C-api" })]);
    expect(accepted).toEqual([]);
    expect(discarded).toBe(1);
  });

  it("TK-114b (B614) : une table déjà possédée reste à son premier déclarant, retirée des suivants", () => {
    const base = context().arch;
    if (base === undefined) throw new Error("contexte d'architecture attendu");
    const arch = {
      ...base,
      tables: new Set(["T-client", "T-salle"]),
      ownedTables: new Set(["T-client"]),
    };
    const owned = context({ arch });
    const { accepted } = run(
      [
        component("Base", { owns: ["T-client", "T-salle"] }),
        component("Cache", { owns: ["T-salle"] }),
      ],
      owned,
    );
    expect(accepted.map((a) => [a.title, a.payload.owns])).toEqual([
      ["Base", ["T-salle"]],
      ["Cache", []],
    ]);
    expect([...arch.ownedTables]).toEqual(["T-client", "T-salle"]);
  });
});
