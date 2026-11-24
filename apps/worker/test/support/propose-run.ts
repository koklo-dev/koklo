import type { AgentProposalKind, AiProvider, AiRequest, AiResponse } from "@koklo/domain";
import type { Run } from "../../src/agent-propose/call.ts";
import type { LaunchSources } from "../../src/agent-propose/sources.ts";
import type { LaunchContext, LaunchProgress } from "../../src/agent-propose/store.ts";
import { titleKey } from "../../src/agent-propose/triage.ts";
import { MemoryProposeStore } from "./memory-propose-store.ts";

/**
 * Banc unitaire d'un segment `agent-propose` (TK-114b) : faux moteur scripté, magasin en mémoire déjà `running`, `Run`
 * construit à la main. Sert aux tests de `call`, `zones-pass` et `coverage-pass` sans passer par le job.
 */
export const LAUNCH: LaunchContext = {
  id: "0195f1a0-0000-7000-8000-000000000011",
  organizationId: "0195f1a0-0000-7000-8000-000000000012",
  projectId: "0195f1a0-0000-7000-8000-000000000013",
  deliverable: "architecture",
  mode: "complete",
  instruction: null,
  requestedBy: "0195f1a0-0000-7000-8000-000000000014",
  baseVersion: null,
};

export interface Reply {
  readonly output: unknown;
  readonly stop?: AiResponse["stop"];
}

/** Faux moteur : la réponse `n` (à partir de 1) est donnée par `script` ; l'horloge avance de `stepMs` par appel. */
export class ScriptedAi implements AiProvider {
  readonly requests: AiRequest[] = [];
  clock = 0;
  private readonly script: (n: number, request: AiRequest) => Reply;
  private readonly stepMs: number;

  constructor(script: (n: number, request: AiRequest) => Reply, stepMs = 0) {
    this.script = script;
    this.stepMs = stepMs;
  }

  async preflight(): Promise<void> {}

  stream(): never {
    throw new Error("non utilisé");
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    this.requests.push(request);
    this.clock += this.stepMs;
    const { output, stop = "end" } = this.script(this.requests.length, request);
    return { output, stop, usage: { inputTokens: 1, outputTokens: 1 } } as unknown as AiResponse;
  }
}

const ids = (items: readonly { specId: string }[] | undefined) =>
  new Set((items ?? []).map((item) => item.specId));

export interface Bench {
  readonly store: MemoryProposeStore;
  readonly ai: ScriptedAi;
  readonly run: Run;
}

/** Segment prêt : magasin `running`, contexte de tri de l'Architecture, horloge du faux moteur, début du segment à 0. */
export function benchOf(
  sources: LaunchSources,
  ai: ScriptedAi,
  options: {
    progress?: Partial<LaunchProgress>;
    kinds?: readonly AgentProposalKind[];
    deadlineMs?: number;
  } = {},
): Bench {
  const store = new MemoryProposeStore(LAUNCH, sources);
  store.state.status = "running";
  const architecture = sources.architecture;
  const run: Run = {
    deps: {
      store,
      ai,
      deadlineMs: options.deadlineMs ?? 600_000,
      now: () => new Date(ai.clock),
    },
    launch: LAUNCH,
    sources,
    euOnly: false,
    progress: {
      segment: 0,
      zones: [],
      zonesDone: 0,
      zonesDiscarded: 0,
      coverageCalls: 0,
      coverageStalled: 0,
      ...options.progress,
    },
    kinds: options.kinds ?? ["component", "archflow"],
    context: {
      kinds: options.kinds ?? ["component", "archflow"],
      titles: {
        component: new Set((architecture?.components ?? []).map((c) => titleKey(c.title))),
      },
      missingCriteria: new Map(),
      arch: {
        features: ids(sources.features),
        rules: ids(sources.rules),
        tables: new Set(sources.tableIds ?? []),
        flows: ids(sources.flows),
        roles: ids(sources.roles),
        components: ids(architecture?.components),
        decisions: ids(architecture?.decisions),
        archflows: ids(architecture?.archflows),
        ownedTables: new Set((architecture?.components ?? []).flatMap((c) => c.owns)),
        docSections: ids(sources.docSections),
      },
    },
    started: 0,
  };
  return { store, ai, run };
}
