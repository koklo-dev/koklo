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

async function launch(mode: string) {
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
  const store = new MemoryProposeStore(context, SOURCES);
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
});
