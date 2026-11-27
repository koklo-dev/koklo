import type { AgentProposalKind } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { technicalBatchPrompt } from "./prompts-technical.ts";
import type { LaunchSources } from "./sources.ts";

/**
 * TK-115b (cas 3, B845) : contexte d'une étape Stack (composants de la couche seuls, choix enregistrés, rôles déjà
 * couverts) et consignes complètes et bornées par appel ; aucun nom de fournisseur du modèle.
 */
const component = (specId: string, type: string) => ({
  specId,
  title: specId.slice(2),
  zone: "Z",
  type,
  owns: [],
  serves: [],
});
const sources: LaunchSources = {
  tag: "technical",
  pages: [],
  synthesis: null,
  risks: null,
  features: [{ specId: "F-001", title: "Réserver", criteria: [] }],
  rules: [],
  roles: [],
  flows: [],
  tables: [{ specId: "T-clientes", title: "Clientes", zone: null, fields: ["id"] }],
  architecture: {
    components: [
      component("C-web", "app"),
      component("C-api", "service"),
      component("C-base", "store"),
      component("C-file", "queue"),
      component("C-sms", "ext"),
    ],
    archflows: [],
    decisions: [{ specId: "ADR-001", title: "Monolithe" }],
    nfr: ["NFR-009"],
  },
  technical: {
    stacks: [
      { specId: "ST-base", role: "Base", choice: "PostgreSQL", layer: "donnees" },
      { specId: "ST-sms", role: "SMS", choice: null, layer: "externes" },
      ...Array.from({ length: 6 }, (_, i) => ({
        specId: `ST-o${i}`,
        role: `Ouvert ${i}`,
        choice: null,
      })),
    ],
    operations: [{ specId: "a.lire", zone: "Z", component: "C-api", summary: "Résumé-op" }],
    requirements: [{ specId: "NFR-001", title: "Vite", category: "performance", target: "p95" }],
    environments: [{ specId: "ENV-recette", name: "Recette" }],
    variables: ["DATABASE_URL"],
  },
  docSections: [],
};

const prompt = (
  zone: string,
  kind: AgentProposalKind = "stack",
  mode = "complete",
  covered: string[] = [],
) =>
  technicalBatchPrompt("ab".repeat(24), {
    sources,
    instruction: null,
    zone,
    kinds: [kind],
    mode,
    covered,
  });

describe("contexte d'une étape Stack", () => {
  it.each([
    ["Stack · Applications", "applications", ["C-web"], false],
    ["Stack · Services et API", "services", ["C-api"], true],
    ["Stack · Données", "data", ["C-base", "C-file"], true],
    ["Stack · Services externes", "external", ["C-sms"], false],
    [
      "Stack · Hébergement et exploitation",
      "operations",
      ["C-web", "C-api", "C-base", "C-file", "C-sms"],
      false,
    ],
  ])("%s : couche %s, ses composants seuls", (zone, layer, ids, tables) => {
    const { user } = prompt(zone);
    expect(user).toContain(`Zone: ${zone}`);
    expect(user).toContain(`Layer: ${layer}`);
    const listed = ["C-web", "C-api", "C-base", "C-file", "C-sms"].filter((id) =>
      user.includes(`${id} | ${id.slice(2)}`),
    );
    expect(listed).toEqual(ids);
    expect(user.includes("T-clientes")).toBe(tables);
    expect(user).toContain("F-001 | Réserver");
    expect(user).toContain("ADR-001 | Monolithe");
    expect(user).toContain("NFR-009");
    expect(user).toContain("NFR-001 | Vite");
    expect(user).toContain("ST-base | Base | PostgreSQL | donnees");
    expect(user).toContain("ST-sms | SMS | open | externes");
    for (const absent of ["Résumé-op", "ENV-recette", "DATABASE_URL"]) {
      expect(user).not.toContain(absent);
    }
  });

  it("rôles déjà couverts dits à l'étape suivante, absents sans rôle publié", () => {
    expect(prompt("Stack · Applications").user).not.toContain("Roles already covered");
    const { user } = prompt("Stack · Données", "stack", "all", ["interface web", "base"]);
    expect(user).toContain("Roles already covered\ninterface web\nbase");
  });

  it("comparer : les seuls choix ouverts du groupe", () => {
    const { user } = prompt("Stack · choix à trancher 2/2", "stack", "compare");
    expect(user).toContain("ST-o5 | Ouvert 5 | open");
    for (const absent of ["ST-sms | SMS", "ST-o0 |", "ST-base |", "Résumé-op"]) {
      expect(user).not.toContain(absent);
    }
  });

  it("les autres étapes gardent tout le cahier actuel", () => {
    const { user } = prompt("Z", "op");
    expect(user).toContain("Résumé-op");
    expect(user).toContain("ENV-recette");
    expect(user).not.toContain("Layer:");
  });
});

const STACK_RULES = [
  "components, requirements and decisions are always present",
  "[]",
  "at most 30 identifiers taken from the data",
  "choice is present only when status is chosen",
  "recommended, when present, is one of the options",
  "two to four distinct",
  "at most 8 entries",
  "one value per option, in the order of the options",
  "role and each option have at most 120 characters",
  "choice at most 200",
  "label at most 120",
  "value at most 200",
  "why at most 1000",
  "plain at most 500",
  "rationale at most 500",
  "short fields hold a single line",
  'never send "" or null',
  "without URL or markup",
];

describe("consignes bornées et complètes", () => {
  it.each(["complete", "compare"])(
    "Stack (%s) : six choix au plus et toutes les règles",
    (mode) => {
      const { system } = prompt("Stack", "stack", mode);
      expect(system).toMatch(/at most 6 /);
      for (const rule of STACK_RULES) expect(system, rule).toContain(rule);
    },
  );

  it.each([
    [
      "op",
      "complete",
      [
        "at most 15 API operations",
        "zone (at most 80 characters)",
        "summary (at most 500 characters)",
        "at most 40 entries each",
        "at most 20 errors",
        "at most 30 rules and at most 30 features",
      ],
    ],
    ["nfr", "complete", ["at most 20 non-functional", "target (a measurable value, at most 120"]],
    ["nfr", "nfr", ["at most 20 items", "target (a verifiable value, at most 120"]],
    ["env", "complete", ["at most 6 environments"]],
    ["doc_section", "complete", ["at most 8 sections"]],
  ])("%s (%s) : bornes par appel", (kind, mode, bounds) => {
    const { system } = prompt("Z", kind as AgentProposalKind, mode);
    for (const bound of bounds) expect(system, bound).toContain(bound);
    expect(system).not.toContain("at most 25");
  });

  it("aucun nom de fournisseur du modèle, dans aucune consigne", () => {
    const systems = (["stack", "op", "nfr", "env", "doc_section"] as const).map(
      (kind) => prompt("Z", kind).system,
    );
    systems.push(prompt("Stack", "stack", "compare").system);
    expect(systems.join(" ").toLowerCase()).not.toMatch(
      /claude|anthropic|openai|gpt|mistral|gemini/,
    );
  });
});
