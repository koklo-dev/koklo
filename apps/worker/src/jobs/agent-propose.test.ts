import { createLogger } from "@koklo/observability";
import { describe, expect, it } from "vitest";
import { MemoryProposeStore } from "../../test/support/memory-propose-store.ts";
import { LAUNCH, ScriptedAi } from "../../test/support/propose-run.ts";
import type { LaunchSources } from "../agent-propose/sources.ts";
import type { ProposeStore } from "../agent-propose/store.ts";
import { createAgentProposeHandler } from "./agent-propose.ts";

/**
 * TK-114b (B617) : charge d'un job de suite et double livraison. Un segment hors 1..7 ou non entier est ignoré sans toucher
 * au lancement ; un second job du même segment, après la prise du premier, ne retraite aucune zone.
 */
const SOURCES: LaunchSources = {
  tag: "architecture",
  pages: [],
  synthesis: null,
  risks: null,
  features: [],
  rules: [],
  roles: [],
  flows: [],
};
const FUNCTIONAL = { ...LAUNCH, deliverable: "functional", mode: "complete" };

function handlerOf(store: ProposeStore) {
  const ai = new ScriptedAi(() => ({ output: { proposals: [] } }));
  const enqueued: number[] = [];
  const handler = createAgentProposeHandler({
    store,
    ai,
    logger: createLogger({ level: "error", destination: { write: () => undefined } }),
    deadlineMs: 600_000,
    now: () => new Date(ai.clock),
    enqueue: async (_id, segment) => void enqueued.push(segment),
  });
  return { ai, enqueued, handler };
}

/** Lancement repris au segment 1, relais posé, deux zones dont la première déjà faite. */
function relayed() {
  const store = new MemoryProposeStore(FUNCTIONAL, SOURCES);
  Object.assign(store.state, {
    status: "running",
    segment: 1,
    handoffAt: new Date(0),
    zones: ["Achats", "Compte"],
    zonesDone: 1,
  });
  return store;
}

describe("job agent-propose : charge et double livraison (TK-114b)", () => {
  it.each([0, 8, 1.5, -1, "2", null, Number.NaN])(
    "segment invalide %s : job ignoré, lancement intact",
    async (segment) => {
      const store = relayed();
      let claims = 0;
      const claim = store.claim.bind(store);
      store.claim = async (...args) => {
        claims += 1;
        return claim(...args);
      };
      const { ai, handler } = handlerOf(store);
      await handler({ id: "job", data: { launchId: LAUNCH.id, segment } });
      expect(claims).toBe(0);
      expect(ai.requests).toHaveLength(0);
      expect(store.state).toMatchObject({ status: "running", segment: 1, zonesDone: 1 });
      expect(store.state.handoffAt).not.toBeNull();
    },
  );

  it("double livraison après la fin du segment : le second job est settled, aucune zone retraitée", async () => {
    const store = relayed();
    const { ai, handler } = handlerOf(store);
    const job = { id: "job", data: { launchId: LAUNCH.id, segment: 1 } };
    await handler(job);
    expect(ai.requests).toHaveLength(1);
    expect(store.state).toMatchObject({ status: "done", zonesDone: 2 });
    await handler(job);
    expect(ai.requests).toHaveLength(1);
    expect(store.state).toMatchObject({ status: "done", zonesDone: 2, errorCode: null });
  });

  it("double livraison pendant le segment (relais déjà pris) : lost → failed worker_lost, aucun appel", async () => {
    const store = relayed();
    store.state.handoffAt = null;
    const { ai, handler } = handlerOf(store);
    await handler({ id: "job", data: { launchId: LAUNCH.id, segment: 1 } });
    expect(ai.requests).toHaveLength(0);
    expect(store.state).toMatchObject({ status: "failed", errorCode: "worker_lost", zonesDone: 1 });
    expect(store.proposals).toHaveLength(0);
  });

  it("job d'un segment déjà dépassé : settled, rien ne change", async () => {
    const store = relayed();
    store.state.segment = 2;
    const { ai, enqueued, handler } = handlerOf(store);
    await handler({ id: "job", data: { launchId: LAUNCH.id, segment: 1 } });
    expect(ai.requests).toHaveLength(0);
    expect(enqueued).toEqual([]);
    expect(store.state).toMatchObject({ status: "running", segment: 2, zonesDone: 1 });
  });
});
