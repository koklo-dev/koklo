import type { AiProvider, AiRequest, AiResponse } from "@koklo/domain";
import { createLogger } from "@koklo/observability";
import { describe, expect, it } from "vitest";
import { MemoryProposeStore } from "../../test/support/memory-propose-store.ts";
import { AGENT_PROPOSE_DEFAULTS, createAgentProposeHandler } from "../jobs/agent-propose.ts";
import type { LaunchSources } from "./sources.ts";

/**
 * TK-115 lot B (cas 8) : génération du cahier technique. Les étapes viennent du code (aucun appel « zones ») : la stack
 * d'abord, puis les opérations zone par zone, les exigences, les environnements et le document, chaque lot publié aussitôt.
 */
const SOURCES: LaunchSources = {
  tag: "technical",
  pages: [],
  synthesis: null,
  risks: null,
  features: [],
  rules: [],
  roles: [],
  flows: [],
  tables: [],
  architecture: {
    components: [
      { specId: "C-api", title: "API", zone: "Réservation", type: "service" },
      { specId: "C-crm", title: "CRM", zone: "Clients", type: "service" },
      { specId: "C-web", title: "Web", zone: "Réservation", type: "app" },
    ].map((c) => ({ ...c, owns: [], serves: [], dependsOn: [], actors: [] })),
    archflows: [],
    decisions: [],
    nfr: [],
  },
  technical: {
    stacks: [{ specId: "ST-sms", role: "SMS", choice: null }],
    operations: [],
    requirements: [
      { specId: "NFR-001", title: "Rapidité", category: "performance", target: "p95" },
    ],
    environments: [],
    variables: [],
  },
  docSections: [],
};

const CONTENT: Record<string, (n: number) => object> = {
  stack: (n) => ({
    role: `Rôle ${n}`,
    components: ["C-api"],
    status: "open",
    options: ["A", "B"],
    criteria: [],
    why: "p",
    requirements: [],
    decisions: [],
  }),
  op: (n) => ({
    name: `zone.op${n}`,
    type: "read",
    zone: "Réservation",
    component: "C-api",
    summary: "Lit.",
    permission: "public",
    input: [],
    output: [],
    errors: [],
    rules: [],
    features: [],
  }),
  nfr: () => ({
    category: "performance",
    title: "Rapidité",
    target: "p95 < 300 ms",
    statement: "Vite.",
    verification: "ci_measure",
    links: [],
  }),
  env: (n) => ({
    name: `Env ${n}`,
    address: "a.exemple.fr",
    hosting: "h",
    database: "d",
    data: "sample",
  }),
  doc_section: (n) => ({ title: `Section ${n}`, markdown: "Texte." }),
};

class FakeAi {
  readonly calls: { purpose: string; kinds: string[]; prompt: string }[] = [];
  readonly schemas: string[] = [];

  async complete(request: AiRequest): Promise<AiResponse> {
    const schema = request.output.kind === "json" ? request.output.schema : {};
    this.schemas.push(JSON.stringify(schema));
    const kinds: string[] = (
      schema as {
        properties: { proposals: { items: { properties: { kind: { enum: string[] } } } } };
      }
    ).properties.proposals.items.properties.kind.enum;
    const n = this.calls.length + 1;
    this.calls.push({
      purpose: request.trace.purpose,
      kinds,
      prompt: `${request.prompt.system}\n${request.prompt.user}`,
    });
    const kind = kinds[0] as string;
    const content = CONTENT[kind]?.(n) ?? {};
    return {
      stop: "end",
      output: { proposals: [{ kind, rationale: "Manquant", content }] },
    } as unknown as AiResponse;
  }
}

async function launch(mode: string, sources: LaunchSources = SOURCES) {
  const context = {
    id: "0195f1a0-0000-7000-8000-000000000001",
    organizationId: "0195f1a0-0000-7000-8000-000000000002",
    projectId: "0195f1a0-0000-7000-8000-000000000003",
    deliverable: "technical",
    mode,
    instruction: null,
    requestedBy: "0195f1a0-0000-7000-8000-000000000004",
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
describe("génération du cahier technique", () => {
  it("tout compléter : stack, opérations par zone, exigences, environnements, document, sans appel « zones »", async () => {
    const { ai, store } = await launch("all");
    expect(store.state.status).toBe("done");
    expect(store.state.zones).toEqual([
      "Stack",
      "Réservation",
      "Clients",
      "Exigences",
      "Environnements",
      "Document · cahier technique",
    ]);
    expect(ai.calls.map((c) => c.kinds)).toEqual([
      ["stack"],
      ["op"],
      ["op"],
      ["nfr"],
      ["env"],
      ["doc_section"],
    ]);
    expect(ai.calls.every((c) => c.purpose === "proposal-batch")).toBe(true);
    expect(store.proposals.map((p) => p.kind)).toEqual([
      "stack",
      "op",
      "op",
      "nfr",
      "env",
      "doc_section",
    ]);
    expect(store.proposals[3]?.payload.specId).toBe("NFR-001");
    expect(ai.schemas.join("")).not.toContain("specId");
  });

  it("consignes constantes : les données en blocs, aucun nom de fournisseur ; la zone traitée est dite", async () => {
    const { ai } = await launch("complete");
    const second = ai.calls[1]?.prompt ?? "";
    expect(second).toContain("Zone: Réservation");
    expect(second).toContain("C-api | API");
    expect(second).toContain("ST-sms | SMS");
    expect(second.toLowerCase()).not.toMatch(/claude|anthropic|openai|gpt|mistral|gemini/);
  });

  it.each([
    ["compare", ["Stack"]],
    ["nfr", ["Exigences"]],
  ])("mode %s : une seule étape", async (mode, zones) => {
    const { ai, store } = await launch(mode);
    expect(store.state.zones).toEqual(zones);
    expect(ai.calls).toHaveLength(1);
  });

  it("plus de huit zones : regroupées, douze étapes au plus", async () => {
    const components = Array.from({ length: 20 }, (_, i) => ({
      specId: `C-c${i}`,
      title: `c${i}`,
      zone: `Zone ${i}`,
      type: "service",
      owns: [],
      serves: [],
      dependsOn: [],
      actors: [],
    }));
    const { store } = await launch("all", {
      ...SOURCES,
      architecture: { components, archflows: [], decisions: [], nfr: [] },
    });
    expect(store.state.zones).toHaveLength(12);
    expect(store.state.zones.join(" ")).toContain("Zone 19");
  });
});
