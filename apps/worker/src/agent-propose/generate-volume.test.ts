import type { AiProvider, AiRequest, AiResponse } from "@koklo/domain";
import { createLogger } from "@koklo/observability";
import { describe, expect, it } from "vitest";
import { MemoryProposeStore } from "../../test/support/memory-propose-store.ts";
import { AGENT_PROPOSE_DEFAULTS, createAgentProposeHandler } from "../jobs/agent-propose.ts";
import type { LaunchSources } from "./sources.ts";
import { titleKey } from "./triage.ts";

/**
 * TK-114b (B613, B616, B617) : reproduction du projet Toto. 174 fonctionnalités, 22 parcours, 48 tables, 9 zones ; chaque
 * appel au modèle dure 210 s (horloge simulée). Avant : 4 zones, puis l'expiration pg-boss. Attendu : des segments de 600 s
 * enchaînés, les 9 zones traitées, une passe de couverture jusqu'à zéro trou, les tables rattachées par le code.
 */
const pad = (n: number) => String(n).padStart(3, "0");
const FEATURES = Array.from({ length: 174 }, (_, i) => ({
  specId: `F-${pad(i + 1)}`,
  title: `Fonctionnalité ${i + 1}`,
  criteria: [],
}));
const FLOWS = Array.from({ length: 22 }, (_, i) => ({
  specId: `P-parcours-${i + 1}`,
  title: `Parcours ${i + 1}`,
}));
const TABLES = Array.from({ length: 48 }, (_, i) => ({
  specId: `T-table-${i + 1}`,
  title: `Table ${i + 1}`,
  zone: null,
  fields: ["id"],
}));
const ZONES = Array.from({ length: 9 }, (_, i) => `Zone ${i + 1}`);

const SOURCES: LaunchSources = {
  tag: "architecture",
  pages: [],
  synthesis: null,
  risks: null,
  features: FEATURES,
  rules: [],
  roles: [{ specId: "RL-client", title: "Client" }],
  flows: FLOWS,
  tables: TABLES,
  tableIds: TABLES.map((table) => table.specId),
  architecture: { components: [], archflows: [], decisions: [], nfr: [] },
};

const LAUNCH = {
  id: "0195f1a0-0000-7000-8000-000000000001",
  organizationId: "0195f1a0-0000-7000-8000-000000000002",
  projectId: "0195f1a0-0000-7000-8000-000000000003",
  deliverable: "architecture",
  mode: "all",
  instruction: null,
  requestedBy: "0195f1a0-0000-7000-8000-000000000004",
  baseVersion: null,
};

const slug = (text: string) => text.toLowerCase().replace(/\s+/g, "-");
const component = (zone: string, k: number, over: Record<string, unknown> = {}) => ({
  kind: "component",
  rationale: "Absent de l'architecture",
  content: {
    name: `${zone} composant ${k}`,
    type: "service",
    zone,
    responsibility: "Fait son travail.",
    ...over,
  },
});
const archflow = (flow: string, componentId: string) => ({
  kind: "archflow",
  rationale: "Parcours sans flux",
  content: {
    flow,
    participants: ["RL-client", componentId],
    messages: [{ from: "RL-client", to: componentId, text: "Agit" }],
  },
});

/** Zone n (1..9) : trois composants, deux fonctionnalités servies chacun, une table possédée, un parcours détaillé. */
function zoneReply(zone: string) {
  const n = Number(zone.split(" ")[1]);
  const first = `C-${slug(zone)}-composant-1`;
  return {
    proposals: [
      ...[1, 2, 3].map((k) =>
        component(zone, k, {
          serves: [
            FEATURES[(n - 1) * 6 + (k - 1) * 2],
            FEATURES[(n - 1) * 6 + (k - 1) * 2 + 1],
          ].map((f) => f?.specId),
          ...(k === 1 ? { owns: [TABLES[n - 1]?.specId] } : {}),
        }),
      ),
      archflow(FLOWS[n - 1]?.specId as string, first),
    ],
  };
}

const linesOf = (text: string, pattern: RegExp) =>
  text.split("\n").flatMap((line) => pattern.exec(line)?.[1] ?? []);

/**
 * Appel de couverture : chaque fonctionnalité du paquet au premier composant connu, un flux par parcours ; TK-114c : chaque
 * composant sans dépendance relié au premier composant connu (lui-même, en asynchrone, au second).
 */
function coverageReply(user: string) {
  const [before, after = ""] = user.split("Known components");
  const [known, second] = linesOf(after, /^(C-[a-z0-9-]+) \| /);
  if (known === undefined) return { proposals: [] };
  const links = linesOf(before ?? "", /^(C-[a-z0-9-]+) \| /).map((from) =>
    from === known
      ? { from, to: second, via: "AMQP", async: true }
      : { from, to: known, via: "HTTP", async: false },
  );
  return {
    assignments: linesOf(user, /^(F-\d{3}) \| /).map((feature) => ({ feature, component: known })),
    proposals: linesOf(user, /^(P-[a-z0-9-]+) \| /).map((flow) => archflow(flow, known)),
    links,
  };
}

interface Script {
  stepMs: number;
  stop?: (call: number) => AiResponse["stop"];
  coverage?: (user: string) => unknown;
}

/** Faux moteur : l'horloge avance de `stepMs` par appel ; zones, zone ou couverture selon la consigne et les données. */
class TotoAi implements AiProvider {
  calls = 0;
  coverageCalls = 0;
  clock = 0;
  readonly script: Script;

  constructor(script: Script) {
    this.script = script;
  }

  async preflight(): Promise<void> {}

  stream(): never {
    throw new Error("non utilisé");
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    this.calls += 1;
    this.clock += this.script.stepMs;
    const { system, user } = request.prompt;
    const zone = /Zone: (Zone \d+)/.exec(user)?.[1];
    let output: unknown;
    if (request.trace.purpose === "proposal-zones") output = { zones: ZONES };
    else if (system.includes("assignments")) {
      this.coverageCalls += 1;
      output = (this.script.coverage ?? coverageReply)(user);
    } else output = zoneReply(zone ?? "");
    const stop = this.script.stop?.(this.calls) ?? "end";
    return { output, stop, usage: { inputTokens: 1, outputTokens: 1 } } as unknown as AiResponse;
  }
}

/** Déroule le lancement comme pg-boss : chaque job de suite déposé est exécuté à son tour. */
async function runLaunch(script: Script) {
  const ai = new TotoAi(script);
  const store = new MemoryProposeStore(LAUNCH, SOURCES);
  const queue: unknown[] = [{ launchId: LAUNCH.id }];
  const handler = createAgentProposeHandler({
    store,
    ai,
    logger: createLogger({ level: "error", destination: { write: () => undefined } }),
    deadlineMs: AGENT_PROPOSE_DEFAULTS.deadlineMs,
    now: () => new Date(ai.clock),
    enqueue: async (launchId, segment) => void queue.push({ launchId, segment }),
  });
  for (let data = queue.shift(); data !== undefined; data = queue.shift()) {
    await handler({ id: "job", data });
  }
  return { ai, store };
}

const duplicates = (store: MemoryProposeStore) => {
  const keys = store.proposals.map((p) => `${p.kind}:${titleKey(p.title)}`);
  return keys.filter((key, i) => keys.indexOf(key) !== i);
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-114b : volume du projet Toto (faux moteur, horloge 210 s par appel)", () => {
  it("segments de 600 s enchaînés, 9 zones, couverture 174/174 · 22/22 · 48/48 · liens 28/28, completed, aucun doublon", async () => {
    const { ai, store } = await runLaunch({ stepMs: 210_000 });
    expect(AGENT_PROPOSE_DEFAULTS.deadlineMs).toBe(600_000);
    expect(store.state).toMatchObject({
      status: "done",
      stopReason: "completed",
      zones: ZONES,
      zonesDone: 9,
      zonesDiscarded: 0,
      errorCode: null,
    });
    expect(store.handoffs.length).toBeGreaterThan(0);
    expect(store.handoffs).toEqual(store.handoffs.map((_, i) => i));
    expect(store.state.segment).toBeLessThan(8);
    expect(store.state.coverageAfter).toEqual({
      features: { covered: 174, total: 174 },
      flows: { covered: 22, total: 22 },
      tables: { covered: 48, total: 48 },
      links: { covered: 28, total: 28 },
    });
    expect(store.state.coverageBefore).toEqual({
      features: { covered: 0, total: 174 },
      flows: { covered: 0, total: 22 },
      tables: { covered: 0, total: 48 },
      links: { covered: 0, total: 0 },
    });
    expect(store.state.coverageCalls).toBe(ai.coverageCalls);
    expect(ai.coverageCalls).toBeGreaterThan(0);
    expect(duplicates(store)).toEqual([]);
    const tables = store.proposals.filter((p) => p.title === "Base de données");
    expect(tables).toHaveLength(1);
    expect(tables[0]?.payload.owns).toHaveLength(39);
  });

  it("zone tronquée : comptée « truncated », le lancement continue jusqu'au bout", async () => {
    const { store } = await runLaunch({
      stepMs: 210_000,
      stop: (call) => (call === 4 ? "max-tokens" : "end"),
    });
    expect(store.state).toMatchObject({
      status: "done",
      stopReason: "completed",
      zonesDone: 8,
      zonesDiscarded: 1,
      discardReasons: { truncated: 1 },
    });
  });

  it("moteur qui n'affecte rien : cap après une passe complète sans trou comblé", async () => {
    const { ai, store } = await runLaunch({ stepMs: 210_000, coverage: () => ({ proposals: [] }) });
    expect(store.state).toMatchObject({ status: "done", stopReason: "cap", zonesDone: 9 });
    expect(ai.coverageCalls).toBe(8);
    expect(store.state.coverageAfter?.features).toEqual({ covered: 54, total: 174 });
    expect(store.state.coverageAfter?.tables).toEqual({ covered: 48, total: 48 });
  });

  it("8 segments épuisés : failed timeout, motif deadline ; ce qui est publié reste, tables rattachées", async () => {
    const { store } = await runLaunch({ stepMs: 700_000 });
    expect(store.state).toMatchObject({
      status: "failed",
      errorCode: "timeout",
      stopReason: "deadline",
      segment: 7,
      zonesDone: 7,
    });
    expect(store.handoffs).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(store.proposals.some((p) => p.title === "Base de données")).toBe(true);
    expect(store.state.coverageAfter?.tables).toEqual({ covered: 48, total: 48 });
  });
});
