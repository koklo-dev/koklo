import type { AiProvider, AiRequest, AiResponse } from "@koklo/domain";
import { createLogger } from "@koklo/observability";
import { describe, expect, it } from "vitest";
import { MemoryProposeStore } from "../../test/support/memory-propose-store.ts";
import { AGENT_PROPOSE_DEFAULTS, createAgentProposeHandler } from "../jobs/agent-propose.ts";
import type { LaunchSources } from "./sources.ts";

/**
 * TK-117 lot B (B806) : génération de la Sécurité. Étapes calculées par le code (surfaces sans menace, parades, droits,
 * sections ; champs par table ; exigences ; résumé), consignes constantes, données en blocs, aucun nom de fournisseur.
 */
const SOURCES: LaunchSources = {
  tag: "security",
  pages: [],
  synthesis: null,
  risks: null,
  features: [
    { specId: "F-001", title: "Réserver", criteria: [] },
    { specId: "F-002", title: "Fichier", criteria: [] },
  ],
  rules: [],
  roles: [{ specId: "RL-accueil", title: "Accueil" }],
  flows: [],
  tables: [],
  technical: { stacks: [], operations: [], requirements: [], environments: [], variables: [] },
  security: {
    threats: [{ specId: "SEC-T08", title: "Export massif", surfaces: ["F-002"], measures: [] }],
    entries: [{ fields: ["clientes.id"], name: "Identifiant", category: "technique" }],
    restrictions: [],
    ownershipRules: [],
    asvs: { level: undefined, requirements: [], facts: [] },
    tables: [
      { id: "T-clientes", champs: [{ nom: "id" }, { nom: "telephone" }] },
      { id: "T-notes", champs: [{ nom: "texte" }] },
    ],
    operations: [{ id: "client.list", permission: "PM-client.lire", serves: ["F-001"] }],
    roles: [{ id: "RL-accueil", name: "Accueil", permissions: ["PM-client.lire"] }],
    summary: false,
  },
  docSections: [{ specId: "DOC-objet", title: "Objet et périmètre", empty: false }],
};

class FakeAi {
  readonly calls: { kinds: string[]; prompt: string }[] = [];
  readonly schemas: string[] = [];

  async complete(request: AiRequest): Promise<AiResponse> {
    const schema = request.output.kind === "json" ? request.output.schema : {};
    this.schemas.push(JSON.stringify(schema));
    const kinds: string[] = (
      schema as {
        properties: { proposals: { items: { properties: { kind: { enum: string[] } } } } };
      }
    ).properties.proposals.items.properties.kind.enum;
    this.calls.push({ kinds, prompt: `${request.prompt.system}\n${request.prompt.user}` });
    return { stop: "end", output: { proposals: [] } } as unknown as AiResponse;
  }
}

async function launch(mode: string, sources: LaunchSources = SOURCES) {
  const context = {
    id: "0195f1a0-0000-7000-8000-000000000011",
    organizationId: "0195f1a0-0000-7000-8000-000000000012",
    projectId: "0195f1a0-0000-7000-8000-000000000013",
    deliverable: "security",
    mode,
    instruction: "Regarde surtout le back-office.",
    requestedBy: "0195f1a0-0000-7000-8000-000000000014",
    baseVersion: null,
  };
  const ai = new FakeAi();
  const store = new MemoryProposeStore(context, sources);
  const handler = createAgentProposeHandler({
    ...AGENT_PROPOSE_DEFAULTS,
    store,
    ai: ai as unknown as AiProvider,
    logger: createLogger({ level: "silent" }),
    enqueue: async () => {},
  });
  await handler({ id: "j", data: { launchId: context.id } });
  return { ai, store };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("génération de la Sécurité", () => {
  it("menaces : surfaces sans menace, parades, droits puis sections manquantes", async () => {
    const { ai, store } = await launch("threats");
    expect(store.state.status).toBe("done");
    expect(store.state.zones).toEqual([
      "F-001",
      "api",
      "Parades",
      "Droits",
      "Document · dossier de sécurité",
    ]);
    expect(ai.calls.map((c) => c.kinds)).toEqual([
      ["threat"],
      ["threat"],
      ["threat"],
      ["right"],
      ["doc_section"],
    ]);
  });

  it.each([
    ["classify", ["clientes", "notes"], "sensitive"],
    ["asvs", ["Exigences"], "asvs"],
    ["summary", ["Résumé client"], "summary"],
  ])("mode %s : ses étapes seules", async (mode, zones, kind) => {
    const { ai, store } = await launch(mode);
    expect(store.state.zones).toEqual(zones);
    expect(ai.calls.map((c) => c.kinds)).toEqual(zones.map(() => [kind]));
    expect(ai.schemas.join("")).not.toContain("specId");
  });

  it("consignes constantes, données en blocs, jamais de conservation ni de fournisseur", async () => {
    const { ai } = await launch("classify");
    const prompt = ai.calls[0]?.prompt ?? "";
    expect(prompt).toContain("clientes.telephone");
    expect(prompt).toContain("Regarde surtout le back-office.");
    expect(prompt).toContain("never");
    expect(prompt.toLowerCase()).not.toMatch(/claude|anthropic|openai|gpt|mistral|gemini/);
  });

  const withOpen = (open: number): LaunchSources => ({
    ...SOURCES,
    features: Array.from({ length: 20 }, (_, i) => ({
      specId: `F-${100 + i}`,
      title: `f${i}`,
      criteria: [],
    })),
    security: {
      ...(SOURCES.security as NonNullable<LaunchSources["security"]>),
      operations: Array.from({ length: 20 }, (_, i) => ({
        id: `x.op${i}`,
        permission: "public",
        serves: [`F-${100 + i}`],
      })),
      threats: Array.from({ length: open }, (_, i) => ({
        specId: `SEC-T${100 + i}`,
        title: `Ouverte ${i}`,
        surfaces: ["api"],
        measures: [],
      })),
    },
    docSections: [],
  });
  const stepBlock = (prompt: string) =>
    prompt.split("Open threats of this step\n")[1]?.split("<")[0] ?? "";

  it("TK-115b : 25 menaces ouvertes : deux étapes de parades de dix, douze étapes au plus", async () => {
    const { ai, store } = await launch("threats", withOpen(25));
    expect(store.state.zones).toHaveLength(12);
    expect(store.state.zones.slice(8, 10)).toEqual(["Parades 1/2", "Parades 2/2"]);
    expect(ai.calls.slice(8, 10).map((c) => c.kinds)).toEqual([["threat"], ["threat"]]);
    const [first, second] = [8, 9].map((i) => stepBlock(ai.calls[i]?.prompt ?? ""));
    expect(first?.match(/SEC-T/g)).toHaveLength(10);
    expect(first).toContain("SEC-T100 | Ouverte 0");
    expect(first).not.toContain("SEC-T110");
    expect(second?.match(/SEC-T/g)).toHaveLength(10);
    expect(second).toContain("SEC-T110 | Ouverte 10");
    expect(ai.calls[0]?.prompt).not.toContain("Open threats of this step");
  });

  it("TK-115b : dix menaces ouvertes au plus : une seule étape « Parades »", async () => {
    const { ai, store } = await launch("threats", withOpen(10));
    expect(store.state.zones.filter((zone) => zone.startsWith("Parades"))).toEqual(["Parades"]);
    const parades = ai.calls.find((c) => c.prompt.includes("Zone: Parades"));
    expect(stepBlock(parades?.prompt ?? "").match(/SEC-T/g)).toHaveLength(10);
  });

  it("TK-115b : bornes par appel : 10 menaces ou parades, 15 exigences", async () => {
    const threats = await launch("threats", withOpen(1));
    expect(threats.ai.calls[0]?.prompt).toContain("at most 10 threats");
    expect(threats.ai.calls[0]?.prompt).toContain("at most 10 countermeasure");
    const asvs = await launch("asvs");
    expect(asvs.ai.calls[0]?.prompt).toContain("at most 15 items");
  });
});
